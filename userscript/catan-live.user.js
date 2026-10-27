// ==UserScript==
// @name         Catan Live — Game Log Submitter
// @namespace    https://github.com/petar19/catan-live
// @version      0.3.3
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

    // Absolute log position -> line. data-index alone can't be trusted as that
    // position: colonist's scroller has been seen to remount messages under a
    // *different* data-index on a later visit (duplicated chunks in one game,
    // a silently dropped roll in another — first-seen-wins on a shifted index
    // does both). Within a single render the indices are consistent with each
    // other, though, so each visible window is placed by data-index plus an
    // offset, and the offset is re-derived every step by checking which shift
    // makes the window's text agree with lines already collected.
    const results = new Map();
    let offset = 0;
    const MAX_SHIFT = 10;

    const collect = () => {
      const visible = [];
      for (const el of chat.querySelectorAll(FEED_MESSAGE_SELECTOR)) {
        visible.push({ index: messageIndex(el), line: extractLine(el) });
      }
      if (visible.length === 0) return;

      // Keep the current offset whenever it's consistent — a shifted
      // candidate can also fit by coincidence in a log full of repeated lines
      // ("X got Wool"). Only when the current offset contradicts collected
      // text, take the nearest-best shift that doesn't.
      let best = null;
      for (let d = 0; d <= MAX_SHIFT; d++) {
        if (d === 1 && best !== null) break;
        for (const candidate of d === 0 ? [offset] : [offset + d, offset - d]) {
          let matches = 0;
          let mismatches = 0;
          for (const { index, line } of visible) {
            const pos = index + candidate;
            if (!results.has(pos)) continue;
            if (results.get(pos) === line) matches++;
            else mismatches++;
          }
          if (mismatches === 0 && (best === null || matches > best.matches)) {
            best = { offset: candidate, matches };
          }
        }
      }
      if (best === null) {
        throw new Error("log window didn't line up with already-collected lines at any shift — refusing to guess");
      }
      offset = best.offset;
      for (const { index, line } of visible) {
        if (!results.has(index + offset)) results.set(index + offset, line);
      }
    };

    const SCROLL_WAIT_MS = 60;
    const STALE_LIMIT = 8; // consecutive no-growth steps before giving up

    async function scroll(limit, direction) {
      // Step about a third of the rendered window, not a whole one: consecutive
      // windows need a good overlap for the offset check in collect() to have
      // enough text to compare (a whole-window jump overlaps by ~1 line).
      const atEnd = () => {
        const n = chat.children.length;
        const k = Math.floor((n * 2) / 3);
        return direction === "down" ? n - 1 - k : k;
      };
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

    // Anchor to the true bottom first, then sweep up to the top once — see
    // 6b04028 for why there's deliberately no second pass back down.
    chat.children[chat.children.length - 1]?.scrollIntoView({ behavior: "auto", block: "start" });
    await wait(SCROLL_WAIT_MS);
    await scroll(1000, "down");
    await scroll(1000, "up");
    collect();

    // sort by position so lines end up in game order
    return [...results.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
  }

  /** Captures the log until two full captures agree line-for-line. The scrape
   * has failed nondeterministically before (a line or chunk duplicated or
   * dropped), and two independent sweeps going wrong in exactly the same way is
   * far less likely than one going wrong — so a mismatch means "don't trust
   * this", not "pick one". */
  async function captureLogConsistently(button) {
    const MAX_ATTEMPTS = 4;
    const captures = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      button.textContent = `Reading log (pass ${attempt})…`;
      const lines = (await collectAllMessageLines()).filter((l) => l != null);
      const key = JSON.stringify(lines);
      if (captures.some((c) => c.key === key)) return lines;
      captures.push({ key, lines });
    }
    const lengths = captures.map((c) => c.lines.length).join(", ");
    throw new Error(`log captures never agreed after ${MAX_ATTEMPTS} passes (line counts: ${lengths}) — not submitting`);
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
    const lines = await captureLogConsistently(button);

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
