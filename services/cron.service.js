import { Octokit } from "@octokit/rest";
import { createAppJWT, getInstallationOctokit } from "./github.service.js";
import { scanInactiveIssues } from "./inactivity.service.js";

export async function handleDailyCron() {
  const appJWT = createAppJWT();
  const appOctokit = new Octokit({ auth: appJWT });

  const { data: installations } = await appOctokit.request(
    "GET /app/installations"
  );

  for (const installation of installations) {
    const octokit = await getInstallationOctokit(installation.id);
    const repos = await octokit.paginate(
      octokit.apps.listReposAccessibleToInstallation,
      { per_page: 100 }
    );

    for (const repo of repos) {
      await scanInactiveIssues(octokit, repo.owner.login, repo.name);
    }
  }
}