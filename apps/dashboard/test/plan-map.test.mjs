// Stage 183 — Plan Map read-only preview helper tests (pure, node --test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanMapPreview,
  normalizePlanMapStatus,
  PLAN_MAP_STATUSES,
  PLAN_MAP_GATES,
} from "../src/lib/plan-map.mjs";
import { getDictionary } from "../src/i18n/dictionary.mjs";

describe("buildPlanMapPreview", () => {
  it("is always a read-only preview and never throws on malformed input", () => {
    for (const bad of [null, undefined, 7, "x", [], { items: 3, title: 1, specCompleteness: "z" }]) {
      assert.doesNotThrow(() => buildPlanMapPreview(bad));
      assert.equal(buildPlanMapPreview(bad).readOnly, true);
    }
  });

  it("generates valid statuses for every stage", () => {
    const p = buildPlanMapPreview({ title: "Demo", goal: "Ship X", specCompleteness: 90, items: [] });
    const all = [...p.sections.done, ...(p.sections.current ? [p.sections.current] : []), ...(p.sections.next ? [p.sections.next] : []), ...p.sections.later];
    assert.equal(all.length, 7); // the journey skeleton
    for (const s of all) assert.ok(PLAN_MAP_STATUSES.includes(s.status), `bad status ${s.status}`);
  });

  it("maps acceptance item statuses into Plan-Map statuses", () => {
    const p = buildPlanMapPreview({
      title: "P",
      goal: "G",
      specCompleteness: 100,
      items: [
        { id: "a", status: "passed" },
        { id: "b", status: "passed" },
        { id: "c", status: "failed" },
        { id: "d", status: "inconclusive" },
        { id: "e", status: "needs_decision" },
      ],
    });
    assert.equal(p.evidence.total, 5);
    assert.equal(p.evidence.completed, 2);
    assert.equal(p.evidence.failed, 1);
    // not_verified = total - passed - failed = 5 - 2 - 1 = 2 (inconclusive + needs_decision)
    assert.equal(p.evidence.notVerifiedCount, 2);
  });

  it("treats unknown / missing evidence as not_verified (never invents pass)", () => {
    const p = buildPlanMapPreview({ title: "P", goal: "G", items: [{ id: "x" }, { status: "weird" }, {}] });
    assert.equal(p.evidence.total, 3);
    assert.equal(p.evidence.completed, 0);
    assert.equal(p.evidence.failed, 0);
    assert.equal(p.evidence.notVerifiedCount, 3);
  });

  it("surfaces an evidence blocker when items are not verified, plus the identity blocker", () => {
    const p = buildPlanMapPreview({ title: "P", goal: "G", items: [{ status: "inconclusive" }] });
    const kinds = p.blockers.map((b) => b.kind);
    assert.ok(kinds.includes("evidence"));
    assert.ok(kinds.includes("identity")); // collaboration always gated by auth decision
  });

  it("always exposes the read-only gate set, all requiring approval", () => {
    const p = buildPlanMapPreview({ title: "P" });
    const keys = p.gates.map((g) => g.key);
    for (const required of ["merge", "deploy", "migration", "mcpPublish", "npmPublish", "auth", "payment", "dns", "productionWrite"]) {
      assert.ok(keys.includes(required), `missing gate ${required}`);
    }
    assert.ok(p.gates.every((g) => g.requiresApproval === true));
    assert.ok(p.gates.every((g) => ["low", "medium", "high"].includes(g.risk)));
    assert.deepEqual(keys, PLAN_MAP_GATES.map((g) => g.key));
  });

  it("places the current marker on the first non-terminal stage", () => {
    // empty project → intake is 'ready' (current is intake or brief, not deploy)
    const empty = buildPlanMapPreview({});
    assert.ok(empty.sections.current);
    assert.equal(empty.position.currentStageId, empty.sections.current.id);
    // a fully-passed project still stops at the approval gates (checkpoint/merge/deploy)
    const full = buildPlanMapPreview({ title: "P", goal: "G", specCompleteness: 100, items: [{ status: "passed" }] });
    assert.ok(["checkpoint", "merge", "deploy"].includes(full.position.currentStageId));
  });

  it("exposes no DB/identity/server fields (read-only, generated)", () => {
    const p = buildPlanMapPreview({ title: "P" });
    assert.equal("userKey" in p, false);
    assert.equal("token" in p, false);
    assert.equal(p.readOnly, true);
  });
});

describe("normalizePlanMapStatus", () => {
  it("passes through valid statuses and coerces unknown to not_verified", () => {
    assert.equal(normalizePlanMapStatus("completed"), "completed");
    assert.equal(normalizePlanMapStatus("needs_approval"), "needs_approval");
    for (const bad of ["bogus", "", null, undefined, 7]) {
      assert.equal(normalizePlanMapStatus(bad), "not_verified");
    }
  });
});

describe("planMap dictionary", () => {
  it("has planMap copy in both locales with every status + gate label", () => {
    for (const loc of ["en", "ko"]) {
      const pm = getDictionary(loc).planMap;
      assert.ok(pm && pm.title && pm.readOnlyPreview, `${loc} planMap missing core copy`);
      for (const s of PLAN_MAP_STATUSES) assert.ok(pm.status[s], `${loc} planMap.status.${s} missing`);
      for (const g of PLAN_MAP_GATES) {
        assert.ok(pm.gates[g.key] && pm.gates[g.key].label, `${loc} planMap.gates.${g.key} missing`);
        assert.ok(pm.gates[g.key].changes && pm.gates[g.key].unchanged, `${loc} planMap.gates.${g.key} approval copy missing`);
      }
    }
  });

  it("uses no certification / production-ready / security / bug-free guarantee language", () => {
    for (const loc of ["en", "ko"]) {
      const blob = JSON.stringify(getDictionary(loc).planMap).toLowerCase();
      for (const banned of ["certified", "production-ready", "bug-free", "final approval", "secure", "guaranteed"]) {
        assert.ok(!blob.includes(banned), `${loc} planMap must not imply "${banned}"`);
      }
    }
  });
});
