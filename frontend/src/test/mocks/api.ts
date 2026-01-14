import { vi } from 'vitest';

// Mock responses
export const mockAirShoppingResponse = {
  data: {
    shoppingResponseId: 'SHOP-123',
    offers: [
      {
        offerId: 'OFFER-1',
        journey: {
          journeyId: 'JRN-1',
          segments: [{
            segmentId: 'SEG-1',
            flightNumber: 'JQ001',
            marketingCarrier: 'JQ',
            origin: 'SYD',
            destination: 'MEL',
            departureDate: '2025-03-15',
            departureTime: '08:00',
            arrivalDate: '2025-03-15',
            arrivalTime: '09:30',
            duration: 90,
          }],
          totalDuration: 90,
          stops: 0,
        },
        bundles: [
          { bundleId: 'B1', bundleName: 'Starter', bundleCode: 'ST', price: 99, currency: 'AUD', tier: 1, inclusions: { baggage: '', meals: false, seatSelection: false, changes: 'Fee', cancellation: 'Non-refundable' } },
          { bundleId: 'B2', bundleName: 'Starter Plus', bundleCode: 'SP', price: 149, currency: 'AUD', tier: 2, isRecommended: true, inclusions: { baggage: '23kg', meals: false, seatSelection: true, changes: 'Fee', cancellation: 'Fee' } },
          { bundleId: 'B3', bundleName: 'Starter Max', bundleCode: 'SM', price: 199, currency: 'AUD', tier: 3, inclusions: { baggage: '30kg', meals: true, seatSelection: true, changes: 'Included', cancellation: 'Included' } },
        ],
      },
    ],
  },
  requestXml: '<AirShoppingRQ>...</AirShoppingRQ>',
  responseXml: '<AirShoppingRS>...</AirShoppingRS>',
  correlationId: 'CORR-123',
  duration: 1500,
};

export const mockOfferPriceResponse = {
  data: {
    offerId: 'OFFER-1',
    totalAmount: 149,
    currency: 'AUD',
    breakdown: {
      base: 100,
      taxes: 30,
      fees: 19,
    },
    paymentFees: [
      { paymentType: 'Visa', paymentCode: 'VI', feeType: 'percentage', feePercentage: 1.5 },
      { paymentType: 'Mastercard', paymentCode: 'MC', feeType: 'percentage', feePercentage: 1.5 },
    ],
  },
  requestXml: '<OfferPriceRQ>...</OfferPriceRQ>',
  responseXml: '<OfferPriceRS>...</OfferPriceRS>',
};

export const mockOrderCreateResponse = {
  data: {
    orderId: 'ORD-123456',
    pnr: 'ABC123',
    status: 'CONFIRMED',
    totalAmount: 149,
    currency: 'AUD',
  },
  requestXml: '<OrderCreateRQ>...</OrderCreateRQ>',
  responseXml: '<OrderCreateRS>...</OrderCreateRS>',
};

export const mockOrderRetrieveResponse = {
  data: {
    orderId: 'ORD-123456',
    pnr: 'ABC123',
    status: 'CONFIRMED',
    flights: [{
      flightNumber: 'JQ001',
      origin: 'SYD',
      destination: 'MEL',
      departureDate: '2025-03-15',
      departureTime: '08:00',
      arrivalTime: '09:30',
    }],
    passengers: [
      { title: 'MR', firstName: 'John', lastName: 'Smith', ptc: 'ADT' },
    ],
    pricing: {
      total: 149,
      currency: 'AUD',
    },
  },
};

// Mock API functions
export const createMockNdcApi = () => ({
  airShopping: vi.fn().mockResolvedValue(mockAirShoppingResponse),
  offerPrice: vi.fn().mockResolvedValue(mockOfferPriceResponse),
  serviceList: vi.fn().mockResolvedValue({ data: { services: [] } }),
  seatAvailability: vi.fn().mockResolvedValue({ data: { seatMaps: [] } }),
  orderCreate: vi.fn().mockResolvedValue(mockOrderCreateResponse),
  orderRetrieve: vi.fn().mockResolvedValue(mockOrderRetrieveResponse),
  orderReshop: vi.fn().mockResolvedValue(mockAirShoppingResponse),
  orderChange: vi.fn().mockResolvedValue({ data: { success: true } }),
});

// Mock session store
export const createMockSession = (overrides = {}) => ({
  auth: {
    token: 'mock-token',
    tokenExpiry: Date.now() + 3600000,
    expiresIn: 3600,
    environment: 'UAT' as const,
  },
  credentials: {
    domain: 'TEST',
    apiId: 'test-api',
    password: 'test-pass',
    subscriptionKey: 'test-key',
    environment: 'UAT' as const,
  },
  isAuthenticated: true,
  myOrganization: { orgCode: 'TEST', orgName: 'Test Organization' },
  ...overrides,
});
