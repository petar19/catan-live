// ==UserScript==
// @name         Catan Live — Game Log Submitter
// @namespace    https://github.com/petar19/catan-live
// @version      0.5.0
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

  /** Reads the whole game log out of colonist's virtual scroller, which only
   * keeps ~10 rows mounted at a time.
   *
   * Based on a recorded trace of the real scroller (579-message game): every
   * row is a fresh element that keeps its own content, and data-index is
   * stable and contiguous from 0 — so a row's index and text can be read
   * together whenever it's mounted, and completeness is checkable (every
   * index 0..last must be present). Rendering after a scroll sometimes takes
   * longer than 5ms, so a step that reveals nothing new just waits and tries
   * again rather than counting as the end.
   *
   * Termination is by index, not boundary text or the starting scroll
   * position: up until index 0 is mounted, down until no higher index appears
   * for a while. The old version (ported from v1's bookmarklet) stopped on
   * text like "won the game" and silently assumed the log started scrolled
   * to the bottom — when it didn't, the opening lines went missing. */
  async function collectAllMessageLines() {
    const chat = document.querySelector(VIRTUAL_SCROLLER_SELECTOR);
    if (!chat) throw new Error("couldn't find the game log scroller on the page");

    const byIndex = new Map(); // data-index -> lines extracted from that row
    const collect = () => {
      for (const row of chat.children) {
        const index = Number(row.dataset.index);
        if (Number.isNaN(index)) throw new Error("log row has no data-index — colonist.io markup changed");
        if (byIndex.has(index)) continue;
        // v1's server took every feedMessage div out of the posted HTML
        // (soup.find_all, which includes the row itself if it matches)
        const messages = [...(row.matches(FEED_MESSAGE_SELECTOR) ? [row] : []), ...row.querySelectorAll(FEED_MESSAGE_SELECTOR)];
        byIndex.set(index, messages.map(extractLine).filter((l) => l != null));
      }
    };
    const minIndex = () => Math.min(...byIndex.keys());
    const maxIndex = () => Math.max(...byIndex.keys());

    const STEP_WAIT_MS = 5;
    const STALL_WAIT_MS = 50;
    const MAX_STALLS = 20; // ~1s of nothing new before giving up on a direction

    // The furthest row currently mounted in a direction. Progress is measured
    // by this moving, not by new rows being collected — scrolling back down
    // through rows already collected on the way up is still progress.
    const edgeIndex = (direction) => {
      const mounted = [...chat.children].map((row) => Number(row.dataset.index));
      return direction === "up" ? Math.min(...mounted) : Math.max(...mounted);
    };

    // Scrolls one way until done() is true, or until the mounted window stops
    // moving for MAX_STALLS steps in a row. Returns whether done() was reached.
    async function sweep(direction, done) {
      let stalls = 0;
      let furthest = edgeIndex(direction);
      while (!done()) {
        const edge = direction === "up" ? chat.children[0] : chat.children[chat.children.length - 1];
        edge.scrollIntoView({ behavior: "auto", block: direction === "up" ? "end" : "start" });
        await wait(stalls === 0 ? STEP_WAIT_MS : STALL_WAIT_MS);
        collect();
        const now = edgeIndex(direction);
        const moved = direction === "up" ? now < furthest : now > furthest;
        if (moved) furthest = now;
        stalls = moved ? 0 : stalls + 1;
        if (stalls >= MAX_STALLS) return false;
      }
      return true;
    }

    collect();
    if (!(await sweep("up", () => byIndex.has(0)))) {
      throw new Error(`couldn't scroll the log to its first message (lowest index seen: ${minIndex()})`);
    }
    // There's no marker for the last message, so "done" is just "stalled".
    await sweep("down", () => false);

    const last = maxIndex();
    const missing = [];
    for (let i = 0; i <= last; i++) if (!byIndex.has(i)) missing.push(i);
    if (missing.length > 0) {
      throw new Error(`log capture has gaps — missing ${missing.length} of ${last + 1} messages (first missing index ${missing[0]}) — not submitting`);
    }

    const lines = [];
    for (let i = 0; i <= last; i++) lines.push(...byIndex.get(i));
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
