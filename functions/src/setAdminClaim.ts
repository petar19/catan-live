import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { submitGameSecret } from "./lib/secrets.js";

/**
 * One-time bootstrap: grants the `admin` custom claim to a user by email.
 * There's no Firebase Console UI for custom claims (Admin SDK only), and no
 * local service-account credential available in this environment to run an
 * Admin SDK script directly — so this rides along with the normal functions
 * deploy instead. Reuses SUBMIT_GAME_SECRET rather than provisioning a
 * separate secret for a function that's only called a handful of times ever.
 *
 * Usage (once deployed):
 *   curl -X POST https://REGION-PROJECT.cloudfunctions.net/setAdminClaim \
 *     -H "X-Submit-Secret: $SECRET" -H "Content-Type: application/json" \
 *     -d '{"email":"petar.lazic.fer@gmail.com"}'
 *
 * Safe to leave deployed — it only ever grants admin to whatever email the
 * caller (who must know the secret) specifies, same trust boundary as
 * submitGame. Delete it later if that's ever a concern.
 */
export const setAdminClaim = onRequest({ secrets: [submitGameSecret] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }
  if (req.get("x-submit-secret") !== submitGameSecret.value()) {
    res.status(401).send("unauthorized");
    return;
  }

  const email = (req.body as { email?: unknown })?.email;
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).send("expected JSON body: { email: string }");
    return;
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: true });

  res.status(200).json({ uid: user.uid, email, admin: true });
});
