import { expect, test } from '@playwright/test';
import { TID } from '../../src/shared/testids';

test('xterm typing', async ({ page }) => {
  await page.goto('./#/play/0.2');
  
  const app = page.getByTestId(TID.app);
  await expect(app).toBeVisible({ timeout: 15000 });

  await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 10000 }).catch(() => {});

  const profileSave = page.getByTestId(TID.profileSave);
  try {
    await expect(profileSave).toBeVisible({ timeout: 3000 });
    await page.getByTestId(TID.profileName).fill('Playwright');
    await profileSave.click();
    await expect(profileSave).toBeHidden({ timeout: 3000 });
  } catch { /* modal didn't appear */ }

  const nextButton = page.getByTestId(TID.storyNext);
  await page.waitForTimeout(1000);
  let noStoryCount = 0;
  while (noStoryCount < 3) {
    if (await nextButton.isVisible()) {
      await nextButton.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(300);
      noStoryCount = 0;
    } else {
      await page.waitForTimeout(500);
      noStoryCount++;
    }
  }

  const terminalInput = page.getByTestId(TID.terminal).locator('textarea');
  await terminalInput.focus();
  
  // Try to type pwd and Enter
  await terminalInput.pressSequentially('pwd\n');
  await page.waitForTimeout(1000);
  
  // Check if it output /home/intern
  const html = await page.getByTestId(TID.terminal).innerHTML();
  if (!html.includes('/home/intern')) {
    console.error("Enter did not work with pressSequentially \\n");
  } else {
    console.log("SUCCESS with pressSequentially \\n");
  }

  // Try evaluate
  await terminalInput.focus();
  await page.keyboard.insertText('ls');
  await terminalInput.evaluate(el => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  });
  await page.waitForTimeout(1000);
  const html2 = await page.getByTestId(TID.terminal).innerHTML();
  if (html2.includes('festival')) {
    console.log("SUCCESS with evaluate keydown Enter");
  } else {
    console.error("Enter did not work with evaluate keydown");
  }

});
