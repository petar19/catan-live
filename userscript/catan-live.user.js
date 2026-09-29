// ==UserScript==
// @name         Catan Live — Game Log Submitter
// @namespace    https://github.com/petar19/catan-live
// @version      0.3.1
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
  const FEED_MESSAGE_SELECTOR = '[class*="feedMessage"]';

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

  /** Scrolls the virtual scroller to force every message into the DOM, collecting
   * each message's text as it renders (ported from bookmark_game_entry.js).
   *
   * The virtual scroller only keeps a small window of messages mounted at a
   * time, so this has to actually pause long enough after each scroll step
   * for React to render newly-revealed messages before collecting — 5ms
   * (the original delay) was too short and silently dropped messages
   * (observed: the game's opening settlement-placement lines and several
   * dice rolls missing from a real submission). Termination is now based on
   * the collected count going stale (no growth for several consecutive
   * steps) rather than trusting a boundary-text match alone, since a
   * mid-game "X has left the game" style line could otherwise trigger an
   * early exit while scrolling up through content that hadn't finished
   * rendering yet. */
  async function collectAllMessageLines() {
    const chat = document.querySelector(VIRTUAL_SCROLLER_SELECTOR);
    if (!chat) throw new Error("couldn't find the game log scroller on the page");

    // Keyed by the message's data-index, not by DOM element: the virtual
    // scroller unmounts messages that scroll out of view and mounts *new*
    // elements when they scroll back in, so a Set of elements collected every
    // message twice (once on the way up, again on the way down) — doubled dice
    // rolls, resources, etc. v1's bookmarklet deduped by data-index for this
    // reason. The line is extracted at collect time since a recycled element
    // may later show a different message.
    const results = new Map();
    const collect = () => {
      for (const el of chat.querySelectorAll(FEED_MESSAGE_SELECTOR)) {
        const index = messageIndex(el);
        if (!results.has(index)) results.set(index, extractLine(el));
      }
    };

    const SCROLL_WAIT_MS = 60;
    const STALE_LIMIT = 8; // consecutive no-growth steps before giving up

    async function scroll(limit, direction) {
      const atEnd = () => (direction === "down" ? chat.children.length - 1 : 0);
      let staleStreak = 0;
      let boundaryHit = false;
      for (let i = 0; i < limit; i++) {
        const target = chat.children[atEnd()];
        if (!target) break;

        const countBefore = results.size;
        target.scrollIntoView({ behavior: "auto", block: direction === "down" ? "start" : "end" });
        await wait(SCROLL_WAIT_MS);
        collect();

        const text = target.innerText || "";
        if (
          text.includes("has left the game") ||
          text.includes("won the game") ||
          text.includes("List of commands: /help") ||
          text.includes("Happy settling")
        ) {
          boundaryHit = true;
        }

        // Keep going past a boundary match as long as new messages are still
        // being collected — only stop once we've also stalled for a while.
        staleStreak = results.size === countBefore ? staleStreak + 1 : 0;
        if (boundaryHit && staleStreak >= STALE_LIMIT) break;
        if (!boundaryHit && staleStreak >= STALE_LIMIT * 3) break; // hard stop even with no boundary text
      }
    }

    chat.children[0]?.scrollIntoView({ behavior: "auto", block: "end" });
    await wait(SCROLL_WAIT_MS);
    await scroll(1000, "up");
    await scroll(1000, "down");
    collect();

    // sort by data-index so lines end up in game order
    return [...results.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
  }

  /** The message's position in the log. data-index may sit on the feedMessage
   * element itself or on a wrapper around it depending on colonist's markup,
   * so check ancestors too. Previously a missing data-index silently became 0
   * for every message, making the sort a no-op and leaving lines in scroll
   * order (end of game first) — which broke player registration, since that
   * relies on the opening placements coming first. Fail loudly instead. */
  function messageIndex(el) {
    const raw = el.closest("[data-index]")?.getAttribute("data-index");
    const index = raw == null ? NaN : Number(raw);
    if (Number.isNaN(index)) throw new Error("log message has no data-index — colonist.io markup changed, can't order lines");
    return index;
  }

  /** Flattens a message element's DOM into a single text line, resolving <img alt>
   * icons to their resource/action names. Client-side port of game_entry_server.py's
   * processMessages() — runs directly against live DOM instead of round-tripping
   * serialized HTML through BeautifulSoup, which is one less place for the two
   * layers to drift out of sync when colonist.io's markup changes. */
  function extractLine(messageEl) {
    if (IGNORED_SUBSTRINGS.some((s) => messageEl.outerHTML.includes(s))) return null;

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
            parts.push(sub.textContent);
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
    const lines = (await collectAllMessageLines()).filter((l) => l != null);

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
