import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { config } from "../../utils/config";
import { logger } from "../../utils/logger";

const toolLogger = logger.child({ component: "github-list-issues" });

/**
 * Calls the GitHub API to list issues for a repository.
 */
async function callGitHubIssuesApi(
  owner: string,
  repo: string,
  state?: string,
  labels?: string
): Promise<any[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (labels) params.set("labels", labels);

  const url = `${apiUrl}?${params.toString()}`;

  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = config.apiKeys.github;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    toolLogger.debug("Using GitHub token for authentication");
  } else {
    toolLogger.debug("Making unauthenticated request to GitHub API");
  }

  toolLogger.info(`Fetching issues from ${url}`);

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      toolLogger.error(
        `GitHub API error ${response.status}: ${errorText.substring(0, 200)}`
      );
      throw new Error(
        `GitHub API error: ${response.status} ${errorText.substring(0, 200)}` // Truncate long errors
      );
    }

    const issues = await response.json();
    return issues;
  } catch (error) {
    toolLogger.error("Failed to fetch GitHub issues", error as Error);
    throw error instanceof Error
      ? error
      : new Error("Unknown error fetching GitHub issues");
  }
}

/**
 * MCP Tool: List GitHub Issues
 * Fetches issues for a specified repository, optionally filtering by state or labels.
 */
export async function githubListIssues(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const { owner, repo, labels } = params;
  // Explicitly set state to default 'open' if not provided
  const state = params.state || "open";

  if (!owner || !repo) {
    throw new Error("Missing required parameters: owner and repo");
  }

  try {
    const issues = await callGitHubIssuesApi(owner, repo, state, labels);

    const formattedIssues = issues.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      user: issue.user?.login,
      labels: issue.labels?.map((l: any) => l.name),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));

    toolLogger.info(
      `Found ${formattedIssues.length} issues for ${owner}/${repo}`
    );

    return {
      content: formattedIssues,
      metadata: {
        count: formattedIssues.length,
        owner,
        repo,
        filter_state: state,
        filter_labels: labels,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      toolLogger.error(
        `Failed to list GitHub issues for ${owner}/${repo}`,
        error as Error
      );
    }
    throw new Error(
      `Failed to list GitHub issues: ${(error as Error).message}`
    );
  }
}

registerTool(
  "github_list_issues",
  "List issues for a GitHub repository",
  {
    type: "object",
    properties: {
      owner: {
        type: "string",
        description: "The owner of the GitHub repository (e.g., 'facebook')",
      },
      repo: {
        type: "string",
        description: "The name of the GitHub repository (e.g., 'react')",
      },
      state: {
        type: "string",
        description: "Filter by issue state",
        enum: ["open", "closed", "all"],
        default: "open",
      },
      labels: {
        type: "string",
        description:
          "Filter by labels (comma-separated string, e.g., 'bug,help wanted')",
      },
    },
    required: ["owner", "repo"],
  },
  githubListIssues,
  "public",
  {
    category: "connectors",
    tags: ["github", "issues", "api", "read"],
  }
);
