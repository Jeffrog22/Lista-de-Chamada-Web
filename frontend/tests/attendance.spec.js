import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test('attendance triple selection shows students', async ({ page }) => {
  // set token so app renders
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'local-session');
  });

  await page.goto('http://localhost:5173/#attendance', { timeout: 60000 });

  // wait for selects to appear
  const selects = page.locator('select');
  await expect(selects.first()).toBeVisible({ timeout: 10000 });

  // choose first turma, then first horario, then first professor
  await selects.nth(0).selectOption({ index: 0 });

  // wait for horario options to populate
  await page.waitForTimeout(300);
  await selects.nth(1).selectOption({ index: 0 });

  // wait for professor options
  await page.waitForTimeout(300);
  await selects.nth(2).selectOption({ index: 0 });

  // wait for attendance table rows
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 5000 });

  const count = await rows.count();
  console.log('attendance rows found:', count);
  expect(count).toBeGreaterThan(0);
});
