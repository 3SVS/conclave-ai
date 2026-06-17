/**
 * Stage 56 — fetchGitHubRepos should surface org-member/collaborator repos
 * (not just the user's own), and follow Link-header pagination.
 * Uses a stubbed fetch — no real GitHub calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { fetchGitHubRepos, fetchGitHubRepoByFullName } = await import(
  "../dist/workspace/github-oauth.js"
);

function res(body, link) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: (h) => (h.toLowerCase() === "link" ? link ?? null : null) },
  };
}

const ownerRepo = {
  id: 1,
  full_name: "seunghunbae-3svs/awesome",
  owner: { login: "seunghunbae-3svs" },
  name: "awesome",
  private: false,
  default_branch: "main",
  html_url: "https://github.com/seunghunbae-3svs/awesome",
  permissions: { pull: true, push: true, admin: true },
};
const orgRepo = {
  id: 2,
  full_name: "3SVS/My-first-product",
  owner: { login: "3SVS" },
  name: "My-first-product",
  private: false,
  default_branch: "main",
  html_url: "https://github.com/3SVS/My-first-product",
  permissions: { pull: true, push: false, admin: false },
};

describe("fetchGitHubRepos (Stage 56 org repos)", () => {
  it("requests owner,collaborator,organization_member affiliation and visibility=all", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return res([ownerRepo], null);
    };
    await fetchGitHubRepos("tok", fetchImpl);
    assert.match(urls[0], /affiliation=owner,collaborator,organization_member/);
    assert.match(urls[0], /visibility=all/);
    assert.match(urls[0], /per_page=100/);
  });

  it("includes an org repo alongside personal repos", async () => {
    const fetchImpl = async () => res([ownerRepo, orgRepo], null);
    const repos = await fetchGitHubRepos("tok", fetchImpl);
    const names = repos.map((r) => r.full_name);
    assert.ok(names.includes("3SVS/My-first-product"), "org repo present");
    assert.ok(names.includes("seunghunbae-3svs/awesome"), "personal repo preserved");
  });

  it("preserves owner/full_name/private and additive permissions", async () => {
    const fetchImpl = async () => res([orgRepo], null);
    const [r] = await fetchGitHubRepos("tok", fetchImpl);
    assert.equal(r.full_name, "3SVS/My-first-product");
    assert.equal(r.owner.login, "3SVS");
    assert.equal(r.private, false);
    assert.deepEqual(r.permissions, { pull: true, push: false, admin: false });
  });

  it("follows Link rel=next pagination and merges pages", async () => {
    let call = 0;
    const fetchImpl = async (url) => {
      call++;
      if (call === 1) {
        assert.ok(!/page=2/.test(url));
        return res([ownerRepo], '<https://api.github.com/user/repos?page=2>; rel="next"');
      }
      assert.match(url, /page=2/);
      return res([orgRepo], null); // no next → stop
    };
    const repos = await fetchGitHubRepos("tok", fetchImpl);
    assert.equal(call, 2, "made two page requests");
    assert.deepEqual(repos.map((r) => r.full_name), [
      "seunghunbae-3svs/awesome",
      "3SVS/My-first-product",
    ]);
  });

  it("stops at maxPages even if a next link keeps appearing", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call++;
      return res([ownerRepo], '<https://api.github.com/user/repos?page=99>; rel="next"');
    };
    await fetchGitHubRepos("tok", fetchImpl, 3);
    assert.equal(call, 3, "bounded by maxPages");
  });
});

describe("fetchGitHubRepoByFullName (Stage 56 direct entry)", () => {
  function res404() {
    return { ok: false, status: 404, json: async () => ({ message: "Not Found" }), headers: { get: () => null } };
  }
  it("resolves an org repo by full name (the listing-omitted case)", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return res(orgRepo, null);
    };
    const repo = await fetchGitHubRepoByFullName("3SVS", "My-first-product", "tok", fetchImpl);
    assert.match(urls[0], /\/repos\/3SVS\/My-first-product$/);
    assert.equal(repo.full_name, "3SVS/My-first-product");
    assert.equal(repo.owner.login, "3SVS");
  });
  it("returns null on 404 (missing or no access)", async () => {
    const repo = await fetchGitHubRepoByFullName("3SVS", "nope", "tok", async () => res404());
    assert.equal(repo, null);
  });
  it("throws on a non-ok, non-404 response", async () => {
    const res500 = { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } };
    await assert.rejects(() => fetchGitHubRepoByFullName("o", "r", "tok", async () => res500));
  });
});
