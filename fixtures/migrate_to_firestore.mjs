#!/usr/bin/env node
// One-time migration: submits all 345 historical gamelogs through the deployed
// submitGame function, same path the userscript uses (so dedupe/parsing/storage
// stay identical — no separate direct-to-Firestore code path to keep in sync).
//
// Usage:
//   SUBMIT_URL=https://REGION-PROJECT.cloudfunctions.net/submitGame \
//   SUBMIT_SECRET=... \
//   node fixtures/migrate_to_firestore.mjs

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAMELOGS_DIR = path.join(HERE, "gamelogs");

const SUBMIT_URL = process.env.SUBMIT_URL;
const SUBMIT_SECRET = process.env.SUBMIT_SECRET;

if (!SUBMIT_URL || !SUBMIT_SECRET) {
  console.error("set SUBMIT_URL and SUBMIT_SECRET env vars first");
  process.exit(1);
}

function loadLines(file) {
  const raw = readFileSync(path.join(GAMELOGS_DIR, file), "utf-8").split("\n");
  return raw[raw.length - 1] === "" ? raw.slice(0, -1) : raw;
}

const files = readdirSync(GAMELOGS_DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort((a, b) => Number(a.replace(".txt", "")) - Number(b.replace(".txt", "")));

let submitted = 0;
let alreadyPresent = 0;
let failed = [];

for (const file of files) {
  const lines = loadLines(file);
  try {
    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Submit-Secret": SUBMIT_SECRET },
      body: JSON.stringify({ lines, sendToDiscord: false }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.isNew) submitted++;
    else alreadyPresent++;
    if (body.warnings?.length) console.log(`${file}: ${body.warnings.length} warning(s)`);
  } catch (err) {
    failed.push([file, err instanceof Error ? err.message : String(err)]);
  }
}

console.log(`\ndone: ${files.length} total, ${submitted} newly submitted, ${alreadyPresent} already present, ${failed.length} failed`);
for (const [file, message] of failed) console.log(`  FAILED ${file}: ${message}`);
