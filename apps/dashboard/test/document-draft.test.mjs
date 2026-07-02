// Stage 267 — pure helpers for the document → spec draft flow.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_ERROR_CODES,
  canConfirmDraft,
  draftOverwriteRisk,
  mapDraftError,
  formatRateLimitedMessage,
} from "../src/lib/document-draft.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const validDraft = {
  source: "llm",
  understood: { summary: "s", targetUsers: ["u"], mainFlow: ["f"] },
  questions: [],
  productSpec: {
    productName: "Meeting summarizer",
    oneLine: "one line",
    targetUsers: ["PM"],
    problem: "p",
    included: ["a"],
    excluded: [],
    userFlow: ["step"],
    decisions: [],
    openQuestions: [],
  },
  items: [{ id: "item-1", title: "Upload works", status: "not_started", criteria: [] }],
};

describe("canConfirmDraft", () => {
  it("accepts a draft with a product name and at least one item", () => {
    assert.equal(canConfirmDraft(validDraft), true);
  });

  it("rejects when productName is missing or blank", () => {
    assert.equal(
      canConfirmDraft({ ...validDraft, productSpec: { ...validDraft.productSpec, productName: "  " } }),
      false,
    );
    assert.equal(canConfirmDraft({ ...validDraft, productSpec: undefined }), false);
  });

  it("rejects when items are empty, missing, or not an array", () => {
    assert.equal(canConfirmDraft({ ...validDraft, items: [] }), false);
    assert.equal(canConfirmDraft({ ...validDraft, items: undefined }), false);
    assert.equal(canConfirmDraft({ ...validDraft, items: "item-1" }), false);
  });

  it("never throws on null / non-object input", () => {
    assert.equal(canConfirmDraft(null), false);
    assert.equal(canConfirmDraft(undefined), false);
    assert.equal(canConfirmDraft("draft"), false);
  });
});

describe("draftOverwriteRisk", () => {
  it("is false for null or an empty project", () => {
    assert.equal(draftOverwriteRisk(null), false);
    assert.equal(draftOverwriteRisk(undefined), false);
    assert.equal(
      draftOverwriteRisk({
        requirements: [],
        spec: { goal: "  ", included: [], excluded: [], openDecisions: [] },
      }),
      false,
    );
  });

  it("is true when the project already has requirements (check items)", () => {
    assert.equal(draftOverwriteRisk({ requirements: [{ id: "r1" }] }), true);
  });

  it("is true when the spec has non-empty content", () => {
    assert.equal(draftOverwriteRisk({ spec: { goal: "Ship it" } }), true);
    assert.equal(draftOverwriteRisk({ spec: { included: ["upload"] } }), true);
    assert.equal(draftOverwriteRisk({ spec: { openDecisions: ["retention"] } }), true);
  });

  it("is true when extended data carries a named productSpec", () => {
    assert.equal(draftOverwriteRisk({ productSpec: { productName: "App" } }), true);
    assert.equal(draftOverwriteRisk({ productSpec: { productName: "" } }), false);
  });
});

describe("mapDraftError", () => {
  it("passes every known backend code through unchanged", () => {
    for (const code of DRAFT_ERROR_CODES) {
      assert.equal(mapDraftError(code), code);
    }
  });

  it("maps bare HTTP statuses when the body was unparseable", () => {
    assert.equal(mapDraftError(403), "forbidden");
    assert.equal(mapDraftError(404), "source_not_found");
    assert.equal(mapDraftError(429), "rate_limited");
    assert.equal(mapDraftError(503), "evidence_storage_unconfigured");
  });

  it("falls back to generic for unknown codes and statuses", () => {
    assert.equal(mapDraftError("totally_new_code"), "generic");
    assert.equal(mapDraftError(500), "generic");
    assert.equal(mapDraftError(null), "generic");
    assert.equal(mapDraftError(undefined), "generic");
  });

  it("every mapped key has a localized message in both en and ko", () => {
    const keys = [...DRAFT_ERROR_CODES, "generic"];
    for (const locale of ["en", "ko"]) {
      const errors = DICTIONARIES[locale].sources.draft.errors;
      for (const key of keys) {
        assert.ok(
          typeof errors[key] === "string" && errors[key].length > 0,
          `${locale}.sources.draft.errors.${key} missing`,
        );
      }
    }
  });
});

describe("formatRateLimitedMessage", () => {
  it("rounds seconds up to whole minutes and fills the placeholder", () => {
    assert.equal(formatRateLimitedMessage("retry in {minutes} min", 61), "retry in 2 min");
    assert.equal(formatRateLimitedMessage("retry in {minutes} min", 60), "retry in 1 min");
    assert.equal(formatRateLimitedMessage("retry in {minutes} min", 1), "retry in 1 min");
  });

  it("defaults to an hour when retryAfterSeconds is missing or invalid", () => {
    assert.equal(formatRateLimitedMessage("{minutes}", undefined), "60");
    assert.equal(formatRateLimitedMessage("{minutes}", -5), "60");
  });
});
