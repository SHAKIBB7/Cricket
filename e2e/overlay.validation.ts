import { test, expect } from '@playwright/test';
import { seedMatches, LIVE_MATCH_ID } from './seed';

/**
 * Overlay system functional validation (Phase 2D).
 *
 * Exercises the unified primitives in a real browser — the things unit
 * and SSR suites cannot prove:
 *  1. UnifiedModal on the live score page (Match Information): opens
 *     through the portal with dialog semantics, traps initial focus
 *     inside the dialog, and closes on Escape.
 *  2. ConfirmationDialog as the destructive gate on match history:
 *     Delete asks first; Cancel preserves the record; confirming in
 *     the dialog (not a native popup) actually deletes it.
 */

test('score page Match Information modal: portal, focus, Escape', async ({ page }) => {
  await seedMatches(page);
  await page.goto(`/matches/score/${LIVE_MATCH_ID}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('main-score-runs')).toHaveText('64');

  // The two trees trigger differently: the mobile button's accessible
  // name is "Info" (title="Match Info"), the desktop button's text is
  // "Match Info". The union selector covers exactly those two.
  // Scroll to center first: at the minimal-scroll position the button's
  // center lands under the sticky bottom bar and the click never lands.
  const infoButton = page.locator('button[title="Match Info"], button.btn-secondary:has-text("Match Info")').first();
  await infoButton.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await infoButton.click();

  const dialog = page.getByRole('dialog', { name: 'Match Information' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Rules & Setup');

  // Focus starts inside the dialog (focus trap).
  const focusInside = await page.evaluate(() => {
    const el = document.activeElement;
    return Boolean(el && el.closest('[role="dialog"]'));
  });
  expect(focusInside).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('match history delete is gated by ConfirmationDialog', async ({ page }) => {
  await seedMatches(page);
  await page.goto('/matches/history', { waitUntil: 'networkidle' });

  const deleteButtons = page.locator('button[title="Delete Match"]');
  await expect(deleteButtons.first()).toBeVisible();
  const before = await deleteButtons.count();

  // Ask first: the unified dialog appears, Cancel preserves the record.
  await deleteButtons.first().click();
  const dialog = page.getByRole('dialog', { name: 'Delete this match record?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(deleteButtons).toHaveCount(before);

  // Confirming in the dialog performs the delete.
  await deleteButtons.first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(deleteButtons).toHaveCount(before - 1);
});
