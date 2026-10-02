import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TID } from '../../src/shared/testids';

const levelsDir = path.resolve(process.cwd(), 'content/levels');

function getLevelFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getLevelFiles(fullPath));
    } else if (fullPath.endsWith('.json') && !fullPath.endsWith('schema.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

const levelFiles = getLevelFiles(levelsDir);
levelFiles.sort((a, b) => {
  const baseA = path.basename(a, '.json');
  const baseB = path.basename(b, '.json');
  return baseA.localeCompare(baseB, undefined, { numeric: true });
});

test.describe('Level Solutions E2E', () => {
  for (const file of levelFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const level = JSON.parse(content);

    if (!level.solution || level.solution.length === 0) {
      continue;
    }

    test(`Level ${level.id} - ${level.title}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`./#/play/${level.id}`);
      
      const app = page.getByTestId(TID.app);
      await expect(app).toBeVisible({ timeout: 15000 });

      // Handle profile setup modal on first launch if it appears
      const profileSave = page.getByTestId(TID.profileSave);
      try {
        await expect(profileSave).toBeVisible({ timeout: 3000 });
        await page.getByTestId(TID.profileName).fill('Playwright');
        await profileSave.click();
        await expect(profileSave).toBeHidden({ timeout: 3000 });
      } catch {
        // modal didn't appear, continue
      }

      // Wait for app to be ready (initial intro animations finished)
      await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 10000 }).catch(() => {});

      const terminalInput = page.getByTestId(TID.terminal).locator('textarea');
      // Only wait for terminal if it's supposed to be there. 
      // If we don't strictly need it to be attached, we can just skip the assertion or catch it.
      await expect(terminalInput).toBeAttached({ timeout: 5000 }).catch(() => {});

      const nextButton = page.getByTestId(TID.storyNext);
      
      // Story might take a moment to animate in
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

      for (const step of level.solution) {
        if (step.run) {
          await page.evaluate((cmd) => {
            if ((window as unknown as Record<string, unknown>).__session) {
              ((window as unknown as Record<string, unknown>).__session as { run: (c: string) => void }).run(cmd);
            }
          }, step.run);
          await page.waitForTimeout(500);
        } else if (step.answer) {
          const choiceBtn = page.getByTestId(TID.questionChoice(step.answer.question, step.answer.choice));
          await expect(choiceBtn).toBeVisible({ timeout: 5000 });
          await choiceBtn.click();
          await page.waitForTimeout(500);
        } else if (step.predict) {
          const choiceBtn = page.getByTestId(TID.predictChoice(step.predict.choice));
          await expect(choiceBtn).toBeVisible({ timeout: 5000 });
          await choiceBtn.click();
          const continueBtn = page.getByTestId(TID.predictContinue);
          await continueBtn.click();
          await page.waitForTimeout(500);
        } else if (step.edit) {
          const fileItem = page.getByTestId(TID.fileTreeItem(step.edit.path));
          if (!(await fileItem.isVisible().catch(() => false))) {
            // File doesn't exist, create it first
            await page.getByTestId(TID.newFileButton).click();
            await page.getByTestId(TID.newFileName).fill(step.edit.path);
            await page.getByTestId(TID.newFileCreate).click();
            await page.waitForTimeout(500);
          }
          await expect(fileItem).toBeVisible({ timeout: 5000 });
          await fileItem.click();
          await page.waitForTimeout(300);

          const cmContent = page.getByTestId(TID.editor).locator('.cm-content');
          await cmContent.focus();
          
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.insertText(step.edit.content);
          
          await page.getByTestId(TID.editorSave).click();
          await page.waitForTimeout(500);
        } else if (step.editor) {
          if (step.editor.content) {
            const editorText = page.getByTestId(TID.gitEditorText);
            await editorText.fill(step.editor.content);
          }
          if (step.editor.action === 'save') {
            await page.getByTestId(TID.gitEditorSave).click();
          } else {
            await page.getByTestId(TID.gitEditorAbort).click();
          }
          await page.waitForTimeout(500);
        } else if (step.story === 'read') {
          // just wait for the loop at the end to catch it
        }
      }

      // Wait for level complete and handle success dialogue
      const showResults = page.getByTestId(TID.showResults);
      let resultsClicked = false;
      for (let i = 0; i < 10; i++) {
        if (await showResults.isVisible()) {
          await showResults.click({ timeout: 1000 }).catch(() => {});
          resultsClicked = true;
          break;
        }
        if (await nextButton.isVisible()) {
          await nextButton.click({ timeout: 1000 }).catch(() => {});
        }
        await page.waitForTimeout(500);
      }
      
      if (!resultsClicked) {
        // Fallback in case it's already on the win screen or showResults didn't appear
        await showResults.click({ timeout: 1000 }).catch(() => {});
      }

      try {
        await expect(page.getByTestId(TID.winScreen)).toBeVisible({ timeout: 5000 });
      } catch (e) {
        console.error("WIN SCREEN NOT FOUND. PAGE HTML:");
        console.error(await page.content());
        throw e;
      }
      expect(errors).toEqual([]);
    });
  }
});
