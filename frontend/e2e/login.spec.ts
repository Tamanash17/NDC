import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/domain/i)).toBeVisible();
    await expect(page.getByLabel(/api id/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByLabel(/subscription key/i)).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });

  test('should navigate to dashboard on successful login', async ({ page }) => {
    // Fill in credentials
    await page.getByLabel(/domain/i).fill('JETSTARAPI');
    await page.getByLabel(/api id/i).fill('test-api-id');
    await page.getByLabel(/password/i).fill('test-password');
    await page.getByLabel(/subscription key/i).fill('test-subscription-key');
    
    // Mock successful login response
    await page.route('**/api/auth/login', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-token',
          expires_in: 3600,
        }),
      });
    });

    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard|\/$/);
  });
});
