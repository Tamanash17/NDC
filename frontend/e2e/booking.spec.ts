import { test, expect } from '@playwright/test';

test.describe('Booking Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('ndc-session', JSON.stringify({
        state: {
          auth: {
            token: 'mock-token',
            tokenExpiry: Date.now() + 3600000,
            environment: 'UAT',
          },
          isAuthenticated: true,
        },
      }));
    });
  });

  test('should complete flight search', async ({ page }) => {
    await page.goto('/booking');
    
    // Fill search form
    await page.getByLabel(/from/i).selectOption('SYD');
    await page.getByLabel(/to/i).selectOption('MEL');
    
    // Select departure date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.getByLabel(/departure/i).fill(tomorrow.toISOString().split('T')[0]);
    
    // Mock AirShopping response
    await page.route('**/api/ndc/air-shopping', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shoppingResponseId: 'SHOP-123',
          offers: [{
            offerId: 'OFFER-1',
            journey: {
              journeyId: 'JRN-1',
              segments: [{
                segmentId: 'SEG-1',
                flightNumber: 'JQ001',
                origin: 'SYD',
                destination: 'MEL',
                departureTime: '08:00',
                arrivalTime: '09:30',
              }],
              totalDuration: 90,
              stops: 0,
            },
            bundles: [
              { bundleId: 'B1', bundleName: 'Starter', price: 99, currency: 'AUD' },
              { bundleId: 'B2', bundleName: 'Plus', price: 149, currency: 'AUD' },
            ],
          }],
        }),
      });
    });

    await page.getByRole('button', { name: /search flights/i }).click();
    
    // Should display results
    await expect(page.getByText('JQ001')).toBeVisible();
    await expect(page.getByText('Starter')).toBeVisible();
  });

  test('should select bundle and continue', async ({ page }) => {
    // Setup: Navigate and search
    await page.goto('/booking');
    
    // Mock search response
    await page.route('**/api/ndc/air-shopping', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shoppingResponseId: 'SHOP-123',
          offers: [{
            offerId: 'OFFER-1',
            journey: {
              journeyId: 'JRN-1',
              segments: [{ segmentId: 'SEG-1', flightNumber: 'JQ001', origin: 'SYD', destination: 'MEL', departureTime: '08:00', arrivalTime: '09:30' }],
              totalDuration: 90,
              stops: 0,
            },
            bundles: [
              { bundleId: 'B1', bundleName: 'Starter', price: 99, currency: 'AUD', tier: 1 },
              { bundleId: 'B2', bundleName: 'Plus', price: 149, currency: 'AUD', tier: 2 },
            ],
          }],
        }),
      });
    });

    // Trigger search
    await page.getByLabel(/from/i).selectOption('SYD');
    await page.getByLabel(/to/i).selectOption('MEL');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.getByLabel(/departure/i).fill(tomorrow.toISOString().split('T')[0]);
    await page.getByRole('button', { name: /search/i }).click();

    // Wait for results and select bundle
    await page.getByText('Starter').click();
    
    // Should show selection indicator
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
  });
});
