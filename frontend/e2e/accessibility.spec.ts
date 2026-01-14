import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('login page should have no accessibility violations', async ({ page }) => {
    await page.goto('/login');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('dashboard should have no accessibility violations', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('ndc-session', JSON.stringify({
        state: {
          auth: { token: 'mock-token', tokenExpiry: Date.now() + 3600000, environment: 'UAT' },
          isAuthenticated: true,
        },
      }));
    });

    await page.goto('/dashboard');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form fields
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/domain/i)).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/api id/i)).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/password/i)).toBeFocused();
  });
});
