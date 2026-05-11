import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyFounderOnNewInstall } from "../dist/notify-founder.js";

// The function calls `new TelegramClient(...)` internally which uses
// the global fetch. We capture sends by stubbing the global.
function withFetchStub(fn) {
  return async (t) => {
    const sends = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      sends.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    };
    try {
      await fn(t, sends);
    } finally {
      globalThis.fetch = original;
    }
  };
}

const baseEnv = {
  TELEGRAM_BOT_TOKEN: "test-token",
  FOUNDER_GITHUB_LOGIN: "founder-login",
  FOUNDER_TG_CHAT_ID: "123",
};

const externalCtx = {
  installationId: 99,
  accountLogin: "outsider",
  targetType: "User",
};

test(
  "notifyFounderOnNewInstall: fires on external install when all secrets present",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(baseEnv, externalCtx);
    assert.equal(fired, true);
    assert.equal(sends.length, 1);
    assert.match(sends[0].url, /api\.telegram\.org\/bottest-token\/sendMessage/);
    const body = JSON.parse(sends[0].init.body);
    assert.equal(body.chat_id, 123);
    assert.match(body.text, /outsider/);
    assert.match(body.text, /installation_id: 99/);
  }),
);

test(
  "notifyFounderOnNewInstall: skips on founder's own install (no fetch made)",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(baseEnv, {
      ...externalCtx,
      accountLogin: "founder-login",
    });
    assert.equal(fired, false);
    assert.equal(sends.length, 0);
  }),
);

test(
  "notifyFounderOnNewInstall: skips when TELEGRAM_BOT_TOKEN missing",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(
      { ...baseEnv, TELEGRAM_BOT_TOKEN: undefined },
      externalCtx,
    );
    assert.equal(fired, false);
    assert.equal(sends.length, 0);
  }),
);

test(
  "notifyFounderOnNewInstall: skips when FOUNDER_TG_CHAT_ID missing",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(
      { ...baseEnv, FOUNDER_TG_CHAT_ID: undefined },
      externalCtx,
    );
    assert.equal(fired, false);
    assert.equal(sends.length, 0);
  }),
);

test(
  "notifyFounderOnNewInstall: skips when chat id is non-numeric",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(
      { ...baseEnv, FOUNDER_TG_CHAT_ID: "not-a-number" },
      externalCtx,
    );
    assert.equal(fired, false);
    assert.equal(sends.length, 0);
  }),
);

test("notifyFounderOnNewInstall: swallows Telegram errors (returns false)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("forbidden", { status: 403 });
  try {
    const fired = await notifyFounderOnNewInstall(baseEnv, externalCtx);
    assert.equal(fired, false);
  } finally {
    globalThis.fetch = original;
  }
});

test(
  "notifyFounderOnNewInstall: still fires when FOUNDER_GITHUB_LOGIN unset (cannot match anyone)",
  withFetchStub(async (_t, sends) => {
    const fired = await notifyFounderOnNewInstall(
      { ...baseEnv, FOUNDER_GITHUB_LOGIN: undefined },
      externalCtx,
    );
    assert.equal(fired, true);
    assert.equal(sends.length, 1);
  }),
);
