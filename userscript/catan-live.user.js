// ==UserScript==
// @name         Catan Live — Game Log Submitter
// @namespace    https://github.com/petar19/catan-live
// @version      0.4.0
// @description  Scrapes the colonist.io game log and submits it to Catan Live
// @author       Petar
// @match        https://colonist.io/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      cloudfunctions.net
// @updateURL    https://raw.githubusercontent.com/petar19/catan-live/main/userscript/catan-live.user.js
// @downloadURL  https://raw.githubusercontent.com/petar19/catan-live/main/userscript/catan-live.user.js
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    SUBMIT_URL: "https://us-central1-catan-live.cloudfunctions.net/submitGame",
  };

  // The secret is never hardcoded in this file (which is public, self-updating
  // code) — it's asked for once and kept in Tampermonkey's own per-script
  // storage (GM_setValue), separate from page-visible localStorage. "Public
  // code, private credential," not security-through-obscurity. Must match the
  // SUBMIT_GAME_SECRET value set via `firebase functions:secrets:set`.
  function getSecret() {
    let secret = GM_getValue("submitSecret");
    if (!secret) {
      secret = prompt("Enter the Catan Live submit secret (ask the admin if you don't have it):");
      if (!secret) throw new Error("no secret entered — can't submit");
      GM_setValue("submitSecret", secret);
    }
    return secret;
  }

  // colonist.io's CSS module class names are hashed and rotate on every frontend
  // rebuild (e.g. "feedMessage-O8TLknGe") — v1 broke on this more than once.
  // Attribute-contains selectors survive a hash rotation as long as the
  // developer-chosen base name doesn't change, which is far less likely to.
  const VIRTUAL_SCROLLER_SELECTOR = '[class*="virtualScroller"]';
  // v1 matched exactly `div.feedMessage-<hash>`. This matches any div with a
  // class *token* starting "feedMessage-", so a hash rotation doesn't break it
  // but nested classes like "feedMessageText-…" still aren't picked up.
  const FEED_MESSAGE_SELECTOR = 'div[class^="feedMessage-"], div[class*=" feedMessage-"]';

  const IGNORED_SUBSTRINGS = [
    "Thank you for playing",
    "List of Commands",
    "Learn how to play",
    "Karma System",
    "<hr/>",
    "Chat now disabled",
  ];

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Straight port of v1's bookmark_game_entry.js, which read the log
   * correctly and quickly for years. Earlier versions of this userscript
   * rewrote it (reading text per scroll step, keying nested feedMessage
   * elements, stale-count termination, multi-pass agreement) and each rewrite
   * traded one wrong-stats bug for another. Kept as close to the original as
   * possible on purpose — the only intended differences are the
   * attribute-contains selector and returning lines instead of HTML.
   *
   * The parts that matter: collect the scroller's *direct children* (the rows
   * that carry data-index), and only read each row's data-index and content
   * once at the very end, after all scrolling — so the index and the text
   * always come from the same row at the same moment. */
  async function collectAllMessageLines() {
    const chat = document.querySelector(VIRTUAL_SCROLLER_SELECTOR);
    if (!chat) throw new Error("couldn't find the game log scroller on the page");

    chat.children[0].scrollIntoView({ behavior: "auto", block: "end" });
    const rows = new Set();
    const collect = () => {
      for (const row of chat.children) rows.add(row);
    };
    collect();

    async function scroll(limit, direction) {
      const atEnd = () => (direction === "down" ? chat.children.length - 1 : 0);
      for (let i = 0; i < limit; i++) {
        chat.children[atEnd()].scrollIntoView({ behavior: "auto", block: direction === "down" ? "start" : "end" });
        collect();
        await wait(5);
        collect();
        const text = chat.children[atEnd()]?.innerText ?? "";
        if (
          text.includes("has left the game") ||
          text.includes("won the game") ||
          text.includes("List of commands: /help") ||
          text.includes("Happy settling")
        ) {
          break;
        }
      }
    }

    await scroll(1000, "up");
    await scroll(1000, "down");

    const sorted = [...rows]
      .map((row) => row.cloneNode(true))
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));

    const seen = new Set();
    const lines = [];
    for (const row of sorted) {
      const index = row.dataset.index;
      if (seen.has(index)) continue;
      seen.add(index);
      // v1's server took every feedMessage div out of the posted HTML
      // (soup.find_all, which includes the row itself if it matches)
      const messages = [...(row.matches(FEED_MESSAGE_SELECTOR) ? [row] : []), ...row.querySelectorAll(FEED_MESSAGE_SELECTOR)];
      for (const message of messages) {
        const line = extractLine(message);
        if (line != null) lines.push(line);
      }
    }
    return lines;
  }

  /** Flattens a message element's DOM into a single text line, resolving <img alt>
   * icons to their resource/action names. Client-side port of game_entry_server.py's
   * processMessages() — runs directly against live DOM instead of round-tripping
   * serialized HTML through BeautifulSoup, which is one less place for the two
   * layers to drift out of sync when colonist.io's markup changes. */
  function extractLine(messageEl) {
    // v1 checked BeautifulSoup's serialization, which writes "<hr/>"; a
    // browser's outerHTML writes "<hr>", so that entry never matched here.
    const html = messageEl.outerHTML.replace(/<hr>/g, "<hr/>");
    if (IGNORED_SUBSTRINGS.some((s) => html.includes(s))) return null;

    const parts = [];

    for (const child of messageEl.children) {
      const tag = child.tagName;
      if (tag === "SPAN") {
        for (const sub of child.childNodes) {
          if (sub.nodeType === Node.ELEMENT_NODE && sub.tagName === "IMG") {
            parts.push(sub.getAttribute("alt"));
          } else if (sub.nodeType === Node.ELEMENT_NODE && sub.tagName === "A") {
            for (const linked of sub.childNodes) {
              if (linked.nodeType === Node.ELEMENT_NODE && linked.tagName === "IMG") {
                parts.push(linked.getAttribute("alt"));
              } else {
                parts.push(linked.textContent);
              }
            }
          } else if (sub.nodeType === Node.ELEMENT_NODE && (sub.tagName === "SPAN" || sub.tagName === "STRONG")) {
            // v1: ' '.join(map(str, sc.contents)) — children joined by a space
            parts.push([...sub.childNodes].map((n) => n.textContent).join(" "));
          } else {
            parts.push(sub.textContent ?? "");
          }
        }
      } else if (tag === "DIV") {
        for (const sub of child.children) {
          if (sub.tagName === "IMG") parts.push(sub.getAttribute("alt"));
        }
      }
    }

    const line = parts.filter((p) => p != null).join("");
    return line.length > 0 ? line : null;
  }

  function submitGame(lines, sendToDiscord, secret) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: CONFIG.SUBMIT_URL,
        headers: {
          "Content-Type": "application/json",
          "X-Submit-Secret": secret,
        },
        data: JSON.stringify({ lines, sendToDiscord }),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(JSON.parse(res.responseText));
          else if (res.status === 401) reject(new Error("rejected: wrong secret (401) — resetting it, try again"));
          else reject(new Error(`submitGame failed: ${res.status} ${res.responseText}`));
        },
        onerror: (err) => reject(err),
      });
    });
  }

  async function run(button) {
    button.textContent = "Reading log…";
    const lines = await collectAllMessageLines();

    if (lines.length === 0) {
      button.textContent = "No game log found";
      return null;
    }

    const sendToDiscord = confirm("Send recap to Discord too?");

    button.textContent = "Submitting…";
    const secret = getSecret();
    let result;
    try {
      result = await submitGame(lines, sendToDiscord, secret);
    } catch (err) {
      // Wrong secret is the one failure mode worth clearing automatically —
      // a stale/mistyped value would otherwise keep failing silently forever.
      if (err.message.includes("wrong secret")) GM_deleteValue("submitSecret");
      throw err;
    }

    return result;
  }

  function addButton() {
    const button = document.createElement("button");
    button.textContent = "Submit to Catan Live";
    Object.assign(button.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: 999999,
      padding: "10px 14px",
      background: "#c0392b",
      color: "white",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "13px",
    });

    // After a submit, the button turns into an "open game" link instead of
    // auto-opening it: window.open() called from deep inside this async
    // chain (after network round-trips) is no longer treated as coming
    // directly from the click, so browsers silently block it as a popup.
    // Making the next click its own fresh, synchronous user gesture avoids
    // that entirely — confirmed this was the actual cause, not a one-off.
    let submittedUrl = null;

    button.addEventListener("click", () => {
      if (submittedUrl) {
        window.open(submittedUrl, "_blank");
        return;
      }
      run(button)
        .then((result) => {
          if (!result) return;
          submittedUrl = result.url ?? null;
          const label = result.isNew ? "Submitted" : "Already submitted";
          button.textContent = submittedUrl ? `${label} — click to open →` : label;
        })
        .catch((err) => {
          console.error("[catan-live]", err);
          button.textContent = "Failed — see console";
        });
    });
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addButton);
  } else {
    addButton();
  }
})();
