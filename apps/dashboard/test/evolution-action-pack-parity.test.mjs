// Stage 77: assert the dashboard preview helper matches the SHARED golden
// fixture (the same fixture central-plane's canonical .ts is checked against).
// If this fails, the dashboard .mjs and central-plane .ts have diverged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEvolutionActionPack } from "../src/lib/evolution-action-pack.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const golden = JSON.parse(
  readFileSync(
    new URL("../../central-plane/test/fixtures/evolution-action-pack-golden.json", import.meta.url),
    "utf8",
  ),
);

// The fixture's expected strings are the canonical EN values; pass the EN bundle.
const s = DICTIONARIES.en.evolution;

for (const c of golden.cases) {
  test(`golden parity (dashboard): ${c.name}`, () => {
    const pack = buildEvolutionActionPack(c.input, s);
    assert.equal(pack.recommendedAction, c.expected.recommendedAction);
    assert.equal(pack.targetCandidateId ?? null, c.expected.targetCandidateId ?? null);
    assert.deepEqual(pack.focusItemIds, c.expected.focusItemIds);
    assert.deepEqual(
      pack.sections.map((sec) => sec.title),
      c.expected.sectionTitles,
    );
    if (c.expected.evidenceBodyContains) {
      const evidenceSec = pack.sections.find((sec) => sec.title === s.secEvidence);
      assert.ok(evidenceSec, "expected an evidence section");
      assert.match(evidenceSec.body, new RegExp(c.expected.evidenceBodyContains));
    }
    if (c.expected.focusBodyContains) {
      const body = pack.sections.map((sec) => sec.body).join("\n");
      for (const needle of c.expected.focusBodyContains) {
        assert.ok(body.includes(needle), `expected focus body to contain "${needle}"`);
      }
    }
  });
}
