// Sets an account's role claim (architecture.md *Auth and roles*). Admin only; the app never sets claims itself.
//   npm run set-role -- <email | snap> recruiter
//   npm run set-role -- <email> company <companyId>
//   npm run set-role -- <email> candidate [candidateId]
// "snap" = SNAP_EMAIL from .env.snap. The user must sign in again (or refresh its token) to see the change.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { AccountRole, Claims } from "@tacit/shared";

const [who, roleArg, id] = process.argv.slice(2);
const role = AccountRole.safeParse(roleArg);
const email = who === "snap" ? process.env.SNAP_EMAIL : who;
if (!email || !role.success || (role.data === "company" && !id)) {
  console.error("usage: npm run set-role -- <email | snap> recruiter|candidate|company [companyId|candidateId]");
  process.exit(1);
}

const keyPath = process.env.TACIT_SERVICE_ACCOUNT ?? resolve(import.meta.dirname, "../server/service-account.json");
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const user = await getAuth().getUserByEmail(email);
const claims: Claims = {
  role: role.data,
  ...(role.data === "company" ? { companyId: id } : {}),
  ...(role.data === "candidate" && id ? { candidateId: id } : {}),
};
await getAuth().setCustomUserClaims(user.uid, Claims.parse(claims)); // replaces any earlier role claims
console.log(`${user.uid}: ${JSON.stringify(claims)}`);
