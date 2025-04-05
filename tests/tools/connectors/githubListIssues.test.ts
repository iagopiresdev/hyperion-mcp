import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { githubListIssues } from "../../../src/tools/connectors/githubListIssues";
import { config } from "../../../src/utils/config";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

describe("Tool: github_list_issues", () => {
  let originalGhToken: string | undefined;

  beforeEach(() => {
    originalGhToken = config.apiKeys.github;
    config.apiKeys.github = undefined; // most tests to check unauthenticated path first
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    config.apiKeys.github = originalGhToken;
    fetchSpy.mockRestore();
  });

  const mockIssue = {
    id: 1,
    number: 1347,
    title: "Found a bug",
    state: "open",
    html_url: "https://api.github.com/repos/octocat/Hello-World/issues/1347",
    user: { login: "octocat" },
    labels: [{ name: "bug" }],
    created_at: "2011-04-22T13:33:48Z",
    updated_at: "2011-04-22T13:33:48Z",
  };

  it("should fetch issues for a repo without authentication", async () => {
    const params = { owner: "octocat", repo: "Spoon-Knife" };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify([mockIssue]), { status: 200 })
    );

    const response = await githubListIssues(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.github.com/repos/${params.owner}/${params.repo}/issues?state=open`, // Default state=open
      expect.objectContaining({
        headers: {
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
          // No Authorization header expected here
        },
      })
    );

    expect(response.content).toHaveLength(1);
    expect(response.content[0].title).toBe(mockIssue.title);
    expect(response.content[0].user).toBe(mockIssue.user.login);
    expect(response.metadata?.count).toBe(1);
    expect(response.metadata?.owner).toBe(params.owner);
    expect(response.metadata?.repo).toBe(params.repo);
  });

  it("should fetch issues with authentication if token is provided", async () => {
    config.apiKeys.github = "test-github-token";
    const params = { owner: "octocat", repo: "Spoon-Knife" };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify([mockIssue]), { status: 200 })
    );

    await githubListIssues(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${config.apiKeys.github}`,
        }),
      })
    );
  });

  it("should apply state and label filters", async () => {
    const params = {
      owner: "octocat",
      repo: "Spoon-Knife",
      state: "closed",
      labels: "bug,enhancement",
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    ); // Assume no match

    await githubListIssues(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.github.com/repos/${params.owner}/${
        params.repo
      }/issues?state=${params.state}&labels=${encodeURIComponent(
        params.labels
      )}`,
      expect.any(Object)
    );
  });

  it("should throw error if owner or repo is missing", async () => {
    await expect(githubListIssues({ repo: "test" })).rejects.toThrow(
      "Missing required parameters: owner and repo"
    );
    await expect(githubListIssues({ owner: "test" })).rejects.toThrow(
      "Missing required parameters: owner and repo"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should handle GitHub API errors", async () => {
    const params = { owner: "octocat", repo: "nonexistent-repo" };
    const mockError = { message: "Not Found", documentation_url: "..." };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockError), { status: 404 })
    );

    await expect(githubListIssues(params)).rejects.toThrow(
      /Failed to list GitHub issues: GitHub API error: 404/
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
