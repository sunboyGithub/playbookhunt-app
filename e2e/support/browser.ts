import type { Page } from "@playwright/test";

/**
 * Browser capabilities a test needs before it can assert on the clipboard.
 *
 * `clipboard-write` is Chromium-only in Playwright: WebKit rejects
 * `grantPermissions` for it fatally rather than ignoring it, so the request has
 * to be narrowed per browser or the mobile (WebKit) project dies on load. Reading
 * the clipboard back is enough to check what was copied, so WebKit keeps that.
 */
export async function grantClipboard(page: Page): Promise<void> {
  const isWebKit = page.context().browser()?.browserType().name() === "webkit";

  await page.context().grantPermissions(
    isWebKit ? ["clipboard-read"] : ["clipboard-read", "clipboard-write"],
  );
}
