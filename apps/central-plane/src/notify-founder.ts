/**
 * One-shot Telegram alert when a new GitHub App install lands that is
 * NOT the founder's own account. Wired into the install/created branch
 * of the GH webhook so the founder is reachable within seconds of a
 * first-time external install — that is the window where a personal
 * welcome DM lands as "they saw me", not "they got my marketing email".
 *
 * Failure is fire-and-forget: any error here is swallowed so the
 * install transaction never fails on a flaky Telegram side-channel.
 */
import { TelegramClient } from "./telegram.js";
import type { Env } from "./env.js";

export interface FounderAlertContext {
  installationId: number;
  accountLogin: string;
  targetType: "User" | "Organization";
}

/**
 * Returns true if the alert was actually dispatched (or attempted),
 * false if it was skipped (founder's own install, or required secrets
 * unset). Tests use the boolean to assert behaviour; the production
 * call path discards it.
 */
export async function notifyFounderOnNewInstall(
  env: Env,
  ctx: FounderAlertContext,
): Promise<boolean> {
  const founderLogin = env.FOUNDER_GITHUB_LOGIN?.trim();
  const founderChatId = env.FOUNDER_TG_CHAT_ID?.trim();
  const token = env.TELEGRAM_BOT_TOKEN?.trim();

  // Any required secret missing → silent skip. Same posture as the rest
  // of the worker: degrade rather than crash.
  if (!token || !founderChatId) return false;

  // The founder's own dogfood installs are noise; skip them.
  if (founderLogin && ctx.accountLogin === founderLogin) return false;

  const chatIdNum = Number.parseInt(founderChatId, 10);
  if (!Number.isFinite(chatIdNum)) return false;

  const text =
    `🎉 First-touch: new ${ctx.targetType.toLowerCase()} install\n` +
    `\n` +
    `account: ${ctx.accountLogin}\n` +
    `installation_id: ${ctx.installationId}\n` +
    `\n` +
    `Welcome-DM template: docs/marketing/welcome-dm.md`;

  try {
    const tg = new TelegramClient({ token });
    await tg.sendMessage({ chatId: chatIdNum, text });
    return true;
  } catch (err) {
    // Don't bubble. The install side of the transaction must always succeed.
    console.warn(`[notify-founder] alert dispatch failed: ${(err as Error).message}`);
    return false;
  }
}
