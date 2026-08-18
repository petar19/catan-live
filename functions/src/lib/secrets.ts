import { defineSecret } from "firebase-functions/params";

/** Shared secret the userscript sends in the X-Submit-Secret header. Single-operator
 * MVP auth — see CLAUDE.md §2.2 for the upgrade path to real Firebase Auth later. */
export const submitGameSecret = defineSecret("SUBMIT_GAME_SECRET");

export const discordWebhookUrlSecret = defineSecret("DISCORD_WEBHOOK_URL");
