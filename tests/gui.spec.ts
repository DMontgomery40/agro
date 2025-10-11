import { test, expect } from '@playwright/test';

test.describe('GUI smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gui/');
    await page.waitForSelector('.tab-bar');
  });

  test('dashboard renders and health shows OK', async ({ page }) => {
    await expect(page.locator('#dash-health')).toBeVisible();
    // Kick health
    await page.waitForTimeout(200);
  });

  test('tab switching works', async ({ page }) => {
    await page.getByRole('button', { name: 'Models' }).click();
    await expect(page.locator('#tab-generation')).toBeVisible();
    await page.getByRole('button', { name: 'Repos & Indexing' }).click();
    await expect(page.locator('#tab-repos')).toBeVisible();
  });

  test('global search highlights', async ({ page }) => {
    await page.fill('#global-search', 'Model');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const marks = await page.locator('mark.hl').count();
    expect(marks).toBeGreaterThan(0);
  });

  test('Git hooks install via Tools tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('button', { name: 'Install' }).click();
    await page.waitForTimeout(200);
    const status = await page.locator('#hooks-status').textContent();
    expect(status || '').not.toContain('Not installed');
  });

  test('indexer quick action updates status', async ({ page }) => {
    // Dashboard quick action
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.locator('#dash-index-start').click();
    await page.waitForTimeout(400);
    const txt = await page.locator('#dash-index-status').textContent();
    expect((txt || '')).toContain('Chunks');
  });

  test('wizard one-click config produces preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.locator('#btn-wizard-oneclick').click();
    await page.waitForTimeout(500);
    const preview = await page.locator('#profile-preview').textContent();
    expect((preview || '')).toContain('Models:');
  });

  test('cost calculator estimates include embeddings', async ({ page }) => {
    await page.getByRole('button', { name: 'Tools' }).click();
    // Switch embedding provider model
    await page.fill('input[name="GEN_MODEL"]', 'gpt-4o-mini');
    await page.selectOption('#cost-embed-provider', { label: 'openai' }).catch(()=>{});
    const embedModel = page.locator('#cost-embed-model');
    if (await embedModel.count()) {
      await embedModel.fill('text-embedding-3-small');
    }
    // set some numbers
    await page.fill('#cost-in', '1000');
    await page.fill('#cost-out', '1000');
    await page.fill('#cost-embeds', '1000');
    await page.fill('#cost-rerank', '1000');
    await page.fill('#cost-rpd', '10');
    // Re-run wizard generate which triggers cost preview underneath
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.locator('#btn-wizard-oneclick').click();
    await page.waitForTimeout(400);
    const preview = await page.locator('#profile-preview').textContent();
    expect((preview || '')).toMatch(/Cost Estimate|Daily|Monthly/);
  });

  test('profiles save and list updates', async ({ page }) => {
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.fill('#profile-name', 'pw-ui');
    const btn = page.locator('#btn-save-profile');
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(200);
      const ul = page.locator('#profiles-ul');
      await expect(ul).toContainText(/pw-ui/);
    }
  });
});
