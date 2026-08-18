// ==UserScript==
// @name         Catan Live — Game Log Submitter
// @namespace    https://github.com/petar19/catan-live
// @version      0.1.0
// @description  Scrapes the colonist.io game log and submits it to Catan Live
// @author       Petar
// @match        https://colonist.io/*
// @grant        GM_xmlhttpRequest
// @connect      cloudfunctions.net
// @updateURL    https://raw.githubusercontent.com/petar19/catan-live/main/userscript/catan-live.user.js
// @downloadURL  https://raw.githubusercontent.com/petar19/catan-live/main/userscript/catan-live.user.js
// ==/UserScript==

(function () {
  "use strict";

  // TODO: fill in once the Cloud Function is deployed (blocked on the GCP project
  // quota issue — see CLAUDE.md task list). SUBMIT_SECRET must match the
  // SUBMIT_GAME_SECRET value set via `firebase functions:secrets:set`.
  const CONFIG = {
    SUBMIT_URL: "https://REGION-PROJECT_ID.cloudfunctions.net/submitGame",
    SUBMIT_SECRET: "REPLACE_ME",
  };

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
   * elements as they render (ported from bookmark_game_entry.js). */
  async function collectAllMessageElements() {
    const chat = document.querySelector(VIRTUAL_SCROLLER_SELECTOR);
    if (!chat) throw new Error("couldn't find the game log scroller on the page");

    const results = new Set();
    const collect = () => {
      for (const el of chat.querySelectorAll(FEED_MESSAGE_SELECTOR)) results.add(el);
    };

    async function scroll(limit, direction) {
      const atEnd = () => (direction === "down" ? chat.children.length - 1 : 0);
      for (let i = 0; i < limit; i++) {
        const target = chat.children[atEnd()];
        if (!target) break;
        target.scrollIntoView({ behavior: "auto", block: direction === "down" ? "start" : "end" });
        collect();
        await wait(5);
        collect();
        const text = target.innerText || "";
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

    chat.children[0]?.scrollIntoView({ behavior: "auto", block: "end" });
    await scroll(1000, "up");
    await scroll(1000, "down");
    collect();

    // sort by data-index so lines end up in game order
    return [...results].sort((a, b) => Number(a.dataset.index ?? 0) - Number(b.dataset.index ?? 0));
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

  function submitGame(lines, sendToDiscord) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: CONFIG.SUBMIT_URL,
        headers: {
          "Content-Type": "application/json",
          "X-Submit-Secret": CONFIG.SUBMIT_SECRET,
        },
        data: JSON.stringify({ lines, sendToDiscord }),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(JSON.parse(res.responseText));
          else reject(new Error(`submitGame failed: ${res.status} ${res.responseText}`));
        },
        onerror: (err) => reject(err),
      });
    });
  }

  async function run(button) {
    button.textContent = "Reading log…";
    const messageElements = await collectAllMessageElements();
    const lines = messageElements.map(extractLine).filter((l) => l != null);

    if (lines.length === 0) {
      button.textContent = "No game log found";
      return;
    }

    const sendToDiscord = confirm("Send recap to Discord too?");

    button.textContent = "Submitting…";
    const result = await submitGame(lines, sendToDiscord);
    button.textContent = result.isNew ? "Submitted!" : "Already submitted";
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
    button.addEventListener("click", () => {
      run(button).catch((err) => {
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
