import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Galaxy Tab S9 landscape'], serviceWorkers: 'block' });

test('paisagem: cadastro em duas colunas e termo cabem sem rolagem lateral', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quero participar' }).click();
  await page.screenshot({ path: 'test-results/telas/10-cadastro-paisagem.png' });
  await page.getByLabel('Nome completo').fill('Ana Souza');
  await page.getByLabel('CPF').fill('52998224725');
  await page.getByLabel('Data de nascimento').fill('10031995');
  await page.getByLabel('Celular').fill('31998765432');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#termo')).toBeVisible();
  await page.screenshot({ path: 'test-results/telas/11-termo-paisagem.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
