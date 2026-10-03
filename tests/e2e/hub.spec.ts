/**
 * Browser checks for the simulated code-hosting site and the classmate repo
 * bundle exchange. These run against the built app, so they catch render
 * errors the jsdom unit tests cannot.
 */
import { expect, test } from '@playwright/test';
import { TID } from '../../src/shared/testids';

async function dismissProfile(page: import('@playwright/test').Page) {
  const save = page.getByTestId(TID.profileSave);
  try {
    await expect(save).toBeVisible({ timeout: 3000 });
    await page.getByTestId(TID.profileName).fill('Playwright');
    await save.click();
    await expect(save).toBeHidden({ timeout: 3000 });
  } catch {
    // Modal did not appear; already have a profile.
  }
}

test.describe('simulated code-hosting site', () => {
  test('renders the repo, issues and a pull request with a diff', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('./#/play/7.3');
    await dismissProfile(page);

    // Click through the story.
    const next = page.getByTestId(TID.storyNext);
    for (let i = 0; i < 12 && (await next.isVisible().catch(() => false)); i++) {
      await next.click().catch(() => {});
      await page.waitForTimeout(150);
    }

    // The hub tab shows the site.
    await page.getByTestId(TID.hubTab).click();
    const panel = page.getByTestId(TID.hubPanel);
    await expect(panel).toBeVisible();
    await expect(page.getByTestId(TID.hubRepoName)).toContainText('festival-site');

    // Pull requests list, then the PR itself.
    await page.getByTestId(TID.hubNavPulls).click();
    await page.getByTestId(TID.hubPullRow(1)).locator('button').click();
    await expect(page.getByTestId(TID.hubPullTitle)).toContainText('food stalls');
    await expect(page.getByTestId(TID.hubPullState)).toHaveAttribute('data-state', 'open');

    // Priya's review and her line comment are both visible.
    await expect(panel).toContainText('requested changes');
    await expect(panel).toContainText('opening hours');

    // The diff renders the real file change.
    await page.getByTestId(TID.hubPullTabFiles).click();
    await expect(page.getByTestId(TID.hubPullDiff('food.html'))).toContainText('samosa');

    expect(errors).toEqual([]);
  });

  test('replying to a review comment completes the level', async ({ page }) => {
    await page.goto('./#/play/7.3');
    await dismissProfile(page);
    const next = page.getByTestId(TID.storyNext);
    for (let i = 0; i < 12 && (await next.isVisible().catch(() => false)); i++) {
      await next.click().catch(() => {});
      await page.waitForTimeout(150);
    }

    await page.getByTestId(TID.hubTab).click();
    await page.getByTestId(TID.hubNavPulls).click();
    await page.getByTestId(TID.hubPullRow(1)).locator('button').click();
    await page.getByTestId(TID.hubPullTabConversation).click();

    // Reply to the first review comment.
    const replyBox = page.locator('[data-testid^="hub-review-reply-box-"]').first();
    await replyBox.fill('Good idea, adding them now.');
    await page.locator('[data-testid^="hub-review-reply-submit-"]').first().click();

    // Answer the understanding question.
    await page.getByTestId(TID.questionChoice('q1', 1)).click();

    await expect(page.getByTestId(TID.showResults).or(page.getByTestId(TID.winScreen))).toBeVisible({ timeout: 10000 });
  });

  test('shows no GitHub branding anywhere in the panel', async ({ page }) => {
    await page.goto('./#/play/6.1');
    await dismissProfile(page);
    const next = page.getByTestId(TID.storyNext);
    for (let i = 0; i < 12 && (await next.isVisible().catch(() => false)); i++) {
      await next.click().catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.getByTestId(TID.hubTab).click();
    const text = (await page.getByTestId(TID.hubPanel).textContent()) ?? '';
    expect(text).not.toMatch(/GitHub/i);
    expect(text).not.toMatch(/octocat/i);
  });
});

test.describe('classmate repo bundle exchange', () => {
  test('exports a repo file and imports it back as a classmate branch', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('./#/sandbox/team-up');
    await dismissProfile(page);

    const panel = page.getByTestId(TID.teamUpPanel);
    await expect(panel).toBeVisible();

    // Make a commit so there is something to export.
    const terminal = page.getByTestId(TID.terminal).locator('textarea');
    await terminal.fill('echo "my idea" > mine.txt');
    await terminal.press('Enter');
    await page.waitForTimeout(300);
    await terminal.fill('git add mine.txt');
    await terminal.press('Enter');
    await page.waitForTimeout(300);
    await terminal.fill('git commit -m "My idea"');
    await terminal.press('Enter');
    await page.waitForTimeout(500);

    // Export downloads a file.
    const download = page.waitForEvent('download');
    await page.getByTestId(TID.teamUpExport).click();
    const file = await download;
    const path = await file.path();
    expect(path).toBeTruthy();
    await expect(page.getByTestId(TID.teamUpStatus)).toContainText('classmate');

    // Importing that same file lands it on a classmate branch.
    await page.getByTestId(TID.teamUpFileInput).setInputFiles(path!);
    await expect(page.getByTestId(TID.teamUpStatus)).toContainText('git merge classmate/');

    expect(errors).toEqual([]);
  });

  test('refuses a file that is not a repo bundle', async ({ page }) => {
    await page.goto('./#/sandbox/team-up');
    await dismissProfile(page);
    await page.getByTestId(TID.teamUpFileInput).setInputFiles({
      name: 'progress.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'git-quest-progress', version: 1 })),
    });
    await expect(page.getByTestId(TID.teamUpStatus)).toContainText('progress file');
  });
});

test.describe('watching a push land', () => {
  test('side-by-side view shows the laptop and the website updating together', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('./#/play/6.3');
    await dismissProfile(page);
    const next = page.getByTestId(TID.storyNext);
    for (let i = 0; i < 12 && (await next.isVisible().catch(() => false)); i++) {
      await next.click().catch(() => {});
      await page.waitForTimeout(150);
    }

    // Switch to the side-by-side view.
    await page.getByTestId(TID.bothTab).click();
    const split = page.getByTestId(TID.splitView);
    await expect(split).toBeVisible();

    // Both halves are on screen at once.
    await expect(split.getByTestId(TID.hubPanel)).toBeVisible();
    await expect(split.getByTestId(TID.worldView)).toBeVisible();

    // Before the push the website has no files listed.
    await expect(split.getByTestId(TID.hubFileRow('README.md'))).toHaveCount(0);

    // Push from the terminal.
    const terminal = page.getByTestId(TID.terminal).locator('textarea');
    await terminal.fill('git push -u origin main');
    await terminal.press('Enter');
    await page.waitForTimeout(600);

    // A predict card may appear first; answer it.
    const choice = page.getByTestId(TID.predictChoice(1));
    if (await choice.isVisible().catch(() => false)) {
      await choice.click();
      await page.getByTestId(TID.predictContinue).click();
      await page.waitForTimeout(600);
    }

    // The website half now lists the pushed files, without leaving the view.
    await expect(split.getByTestId(TID.hubFileRow('README.md'))).toBeVisible({ timeout: 10000 });
    await expect(split.getByTestId(TID.hubFileRow('index.html'))).toBeVisible();

    expect(errors).toEqual([]);
  });
});
