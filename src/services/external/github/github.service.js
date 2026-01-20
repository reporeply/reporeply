import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { Octokit } from "@octokit/rest";

export function createAppJWT() {
  // ✅ Read private key from file or env var
  let privateKey;

  if (process.env.GITHUB_PRIVATE_KEY_PATH) {
    // Resolve relative path from project root
    const keyPath = path.resolve(
      process.cwd(),
      process.env.GITHUB_PRIVATE_KEY_PATH
    );
    console.log(`[GitHub Service] Reading private key from: ${keyPath}`);
    privateKey = fs.readFileSync(keyPath, "utf8");
    console.log("[GitHub Service] ✅ Private key loaded from file");
  } else if (process.env.GITHUB_PRIVATE_KEY) {
    privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
    console.log("[GitHub Service] ✅ Private key loaded from env var");
  } else {
    throw new Error(
      "No GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH found in environment"
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 30,
      exp: now + 540,
      iss: Number(process.env.GITHUB_APP_ID),
    },
    privateKey,
    { algorithm: "RS256" }
  );
}

export async function getInstallationOctokit(installationId) {
  const appJWT = createAppJWT();
  const appOctokit = new Octokit({ auth: appJWT });

  const { data } = await appOctokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId }
  );

  return new Octokit({ auth: data.token });
}
