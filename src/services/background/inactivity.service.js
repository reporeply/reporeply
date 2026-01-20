const INACTIVITY_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_IN_DAY);
}

async function hasInactivityWarning(octokit, owner, repo, issueNumber) {
  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return comments.some(
    (c) => c.user?.type === "Bot" && c.body?.includes("inactive for")
  );
}

export async function scanInactiveIssues(octokit, owner, repo) {
  const issues = await octokit.paginate(octokit.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });

  for (const issue of issues) {
    if (issue.pull_request) continue;

    const labels = issue.labels.map((l) =>
      typeof l === "string" ? l : l.name
    );

    if (labels.includes("do-not-close")) continue;

    const inactiveDays = daysSince(issue.updated_at);

    if (inactiveDays >= INACTIVITY_DAYS) {
      const warned = await hasInactivityWarning(
        octokit,
        owner,
        repo,
        issue.number
      );

      if (!warned) {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: issue.number,
          body:
            `This issue has been inactive for ${INACTIVITY_DAYS} days.\n\n` +
            `If no further activity occurs, it will be automatically closed in ${GRACE_PERIOD_DAYS} days.`,
        });
        continue;
      }
    }

    if (inactiveDays >= INACTIVITY_DAYS + GRACE_PERIOD_DAYS) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body:
          "Closing this issue due to prolonged inactivity.\n\n" +
          "If this is still relevant, please reopen with updated information.",
      });

      await octokit.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: "closed",
      });
    }
  }
}