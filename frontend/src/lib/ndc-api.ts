import axios from 'axios';
import { useSessionStore } from '@/core/context/SessionStore';

// Use localhost for local development, Railway for production
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3002/api'
  : 'https://ndc-production.up.railway.app/api';

export async function login(credentials: {
  domain: string;
  apiId: string;
  password: string;
  subscriptionKey: string;
  environment: 'UAT' | 'PROD';
}) {
  const response = await axios.post(API_BASE_URL + '/auth/login', {
    domain: credentials.domain,
    apiId: credentials.apiId,
    password: credentials.password,
    subscriptionKey: credentials.subscriptionKey,
    environment: credentials.environment,
  });

  return {
    token: response.data.token,
    tokenExpiry: Date.now() + (response.data.expires_in * 1000),
    expiresIn: response.data.expires_in,
    environment: response.data.environment,
  };
}

const ndcClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

ndcClient.interceptors.request.use((config) => {
  const { auth, credentials } = useSessionStore.getState();
  if (auth?.token) {
    config.headers.Authorization = 'Bearer ' + auth.token;
  }
  if (credentials?.subscriptionKey) {
    config.headers['Ocp-Apim-Subscription-Key'] = credentials.subscriptionKey;
  }
  config.headers['X-NDC-Environment'] = auth?.environment || 'UAT';
  config.headers['NDCUAT'] = 'Jetstar3.12';
  return config;
});

ndcClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useSessionStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export async function airShopping(request: any) {
  const response = await ndcClient.post('/ndc/air-shopping', request);
  return response.data;
}

export async function offerPrice(request: any) {
  const response = await ndcClient.post('/ndc/offer-price', request);
  return response.data;
}

export async function serviceList(request: any) {
  const response = await ndcClient.post('/ndc/service-list', request);
  return response.data;
}

export async function seatAvailability(request: any) {
  const response = await ndcClient.post('/ndc/seat-availability', request);
  return response.data;
}

export async function orderCreate(request: any) {
  const response = await ndcClient.post('/ndc/order-create', request);
  return response.data;
}

export async function orderRetrieve(request: any) {
  const response = await ndcClient.post('/ndc/order-retrieve', request);
  return response.data;
}

export async function orderReshop(request: any) {
  const response = await ndcClient.post('/ndc/order-reshop', request);
  return response.data;
}

export async function orderQuote(request: any) {
  const response = await ndcClient.post('/ndc/order-quote', request);
  return response.data;
}

export async function orderChange(request: any) {
  const response = await ndcClient.post('/ndc/order-change', request);
  return response.data;
}

export async function processPayment(request: any) {
  const response = await ndcClient.post('/ndc/process-payment', request);
  return response.data;
}

export async function airlineProfile(request: any) {
  const response = await ndcClient.post('/ndc/airline-profile', request);
  return response.data;
}

export interface LongSellSegment {
  segmentId: string;
  origin: string;
  destination: string;
  departureDateTime: string;
  carrierCode: string;
  flightNumber: string;
  cabinCode?: string;
}

export interface LongSellJourney {
  journeyId: string;
  origin: string;
  destination: string;
  segmentIds: string[];
}

export interface LongSellPassenger {
  paxId: string;
  ptc: 'ADT' | 'CHD' | 'INF';
}

// Bundle selection per journey
export interface LongSellBundle {
  bundleCode: string; // e.g., 'P200' for STARTER PLUS
  journeyIndex: number; // 0 = outbound, 1 = inbound
  paxIds: string[]; // e.g., ['ADT0', 'ADT1', 'CHD0', 'CHD1'] - excludes INF
}

// SSR (Special Service Request) like UPFX (Upfront Seating)
export interface LongSellSSR {
  ssrCode: string; // e.g., 'UPFX'
  segmentIndex: number; // which segment this SSR is for
  paxId: string; // which passenger
}

// Seat selection
export interface LongSellSeat {
  segmentIndex: number; // which segment this seat is for
  paxId: string; // which passenger
  row: string; // e.g., '2'
  column: string; // e.g., 'D'
}

export interface LongSellRequest {
  segments: LongSellSegment[];
  journeys: LongSellJourney[];
  passengers: LongSellPassenger[];
  cardBrand: string;
  currency: string;
  // Optional: Additional items for accurate total pricing
  bundles?: LongSellBundle[];
  ssrs?: LongSellSSR[];
  seats?: LongSellSeat[];
}

export interface CCFeeResult {
  cardBrand: string;
  ccSurcharge: number;
  surchargeType: 'fixed' | 'percentage' | 'unknown';
  rawResponse?: any;
  requestXml?: string;
  error?: string;
}

export async function longSell(request: LongSellRequest): Promise<CCFeeResult> {
  console.log(`[LongSell] ===== REQUEST FOR ${request.cardBrand} =====`);
  console.log('[LongSell] Request payload:', JSON.stringify(request, null, 2));

  const response = await ndcClient.post('/ndc/long-sell', request);
  // Backend returns { success, data: { cardBrand, ccSurcharge, surchargeType, currency }, requestXml, responseXml }
  const data = response.data.data || response.data;

  console.log(`[LongSell] ===== RESPONSE FOR ${request.cardBrand} =====`);
  console.log('[LongSell] Success:', response.data.success);
  console.log('[LongSell] CC Surcharge:', data.ccSurcharge);
  console.log('[LongSell] Request XML:', response.data.requestXml?.substring(0, 500) + '...');
  console.log('[LongSell] Response XML:', response.data.responseXml?.substring(0, 1000) + '...');
  console.log('[LongSell] Full Response XML:');
  console.log(response.data.responseXml);

  return {
    cardBrand: request.cardBrand,
    ccSurcharge: data.ccSurcharge || 0,
    surchargeType: data.surchargeType || 'unknown',
    rawResponse: response.data.responseXml,
    requestXml: response.data.requestXml,
  };
}

export async function fetchAllCCFees(
  segments: LongSellSegment[],
  journeys: LongSellJourney[],
  passengers: LongSellPassenger[],
  currency: string,
  bundles?: LongSellBundle[],
  ssrs?: LongSellSSR[],
  seats?: LongSellSeat[]
): Promise<CCFeeResult[]> {
  // Card brand codes: VI=Visa, MC=Mastercard, AX=Amex
  // JCB removed as per requirements
  const cardBrands = ['VI', 'MC', 'AX'];
  const results: CCFeeResult[] = [];

  // Make requests SEQUENTIALLY to avoid DuplicateLeg errors
  // The Jetstar API doesn't allow concurrent Long Sell requests
  console.log('[LongSell] ===== FETCHING CC FEES =====');
  console.log('[LongSell] Segments:', segments.length);
  console.log('[LongSell] Journeys:', journeys.length);
  console.log('[LongSell] Passengers:', passengers.length);
  console.log('[LongSell] Bundles:', bundles?.length || 0);
  console.log('[LongSell] SSRs:', ssrs?.length || 0);
  console.log('[LongSell] Seats:', seats?.length || 0);
  console.log('[LongSell] Currency:', currency);

  for (const cardBrand of cardBrands) {
    try {
      const result = await longSell({ segments, journeys, passengers, cardBrand, currency, bundles, ssrs, seats });
      results.push(result);
    } catch (err: any) {
      console.error(`[LongSell] ===== ERROR FOR ${cardBrand} =====`);
      console.error(`[LongSell] Error message:`, err.message);
      console.error(`[LongSell] Error response status:`, err.response?.status);
      console.error(`[LongSell] Error response data:`, err.response?.data);
      const responseData = err.response?.data;
      if (responseData?.requestXml) {
        console.error(`[LongSell] Request XML:`, responseData.requestXml);
      }
      if (responseData?.responseXml) {
        console.error(`[LongSell] Response XML:`, responseData.responseXml);
      }
      results.push({
        cardBrand,
        ccSurcharge: 0,
        surchargeType: 'unknown' as const,
        error: err.message,
        rawResponse: responseData?.responseXml || (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)) || `Error: ${err.message}`,
        requestXml: responseData?.requestXml || 'Not available in error response',
      });
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

// ----------------------------------------------------------------------------
// CC FEES FROM ORDER - New unified approach using OrderRetrieve
// This is the recommended way to get CC fees - works for both prime booking and servicing
// ----------------------------------------------------------------------------

export interface CCFeesRequest {
  orderId: string;
  ownerCode?: string;
  currency?: string;
  distributionChain?: {
    ownerCode: string;
    links: Array<{
      ordinal: number;
      orgRole: string;
      orgId: string;
      orgName?: string;
    }>;
  };
}

export interface CCFeesResponse {
  orderId: string;
  currency: string;
  fees: CCFeeResult[];
}

/**
 * Fetch CC surcharge fees for an existing order
 *
 * This is the preferred method for getting CC fees because:
 * 1. Works for both Prime Booking and Servicing flows
 * 2. Uses real order data from OrderRetrieve
 * 3. Backend handles all Long Sell calls sequentially
 * 4. No need to reconstruct booking data on frontend
 *
 * @param request - Order ID and optional parameters
 * @returns All CC fees for VI, MC, AX card brands
 */
export async function ccFees(request: CCFeesRequest): Promise<CCFeesResponse> {
  console.log('[CCFees] ===== FETCHING CC FEES FOR ORDER =====');
  console.log('[CCFees] Order ID:', request.orderId);

  const response = await ndcClient.post('/ndc/cc-fees', request);

  console.log('[CCFees] ===== RESPONSE =====');
  console.log('[CCFees] Success:', response.data.success);
  console.log('[CCFees] Duration:', response.data.duration, 'ms');

  const data = response.data.data;
  console.log('[CCFees] Fees:', data.fees?.map((f: any) => ({
    cardBrand: f.cardBrand,
    ccSurcharge: f.ccSurcharge,
    error: f.error,
  })));

  // Transform to CCFeeResult format for compatibility
  const fees: CCFeeResult[] = (data.fees || []).map((fee: any) => ({
    cardBrand: fee.cardBrand,
    ccSurcharge: fee.ccSurcharge || 0,
    surchargeType: fee.surchargeType || 'unknown',
    rawResponse: fee.responseXml,
    requestXml: fee.requestXml,
    error: fee.error,
  }));

  return {
    orderId: data.orderId,
    currency: data.currency,
    fees,
  };
}

// ----------------------------------------------------------------------------
// ENVIRONMENT SWITCHING API
// ----------------------------------------------------------------------------

export type NDCEnvironment = 'UAT' | 'PROD';

export interface EnvironmentInfo {
  current: NDCEnvironment;
  baseUrl: string;
  authUrl: string;
  headerName: string;
  headerValue: string;
  available: NDCEnvironment[];
}

export interface EnvironmentSwitchResult extends EnvironmentInfo {
  success: boolean;
  previous: NDCEnvironment;
  message: string;
}

/**
 * Get current NDC environment from backend
 */
export async function getEnvironment(): Promise<EnvironmentInfo> {
  const response = await axios.get(API_BASE_URL + '/environment');
  return response.data;
}

/**
 * Switch NDC environment on backend
 */
export async function setEnvironment(environment: NDCEnvironment): Promise<EnvironmentSwitchResult> {
  const response = await axios.post(API_BASE_URL + '/environment', { environment });
  return response.data;
}