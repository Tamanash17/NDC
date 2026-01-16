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

export interface LongSellRequest {
  segments: LongSellSegment[];
  journeys: LongSellJourney[];
  passengers: LongSellPassenger[];
  cardBrand: string;
  currency: string;
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
  const response = await ndcClient.post('/ndc/long-sell', request);
  // Backend returns { success, data: { cardBrand, ccSurcharge, surchargeType, currency }, requestXml, responseXml }
  const data = response.data.data || response.data;
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
  currency: string
): Promise<CCFeeResult[]> {
  // Card brand codes: VI=Visa, MC=Mastercard, AX=Amex
  // JCB removed as per requirements
  const cardBrands = ['VI', 'MC', 'AX'];
  const results: CCFeeResult[] = [];

  // Make requests SEQUENTIALLY to avoid DuplicateLeg errors
  // The Jetstar API doesn't allow concurrent Long Sell requests
  for (const cardBrand of cardBrands) {
    try {
      const result = await longSell({ segments, journeys, passengers, cardBrand, currency });
      results.push(result);
    } catch (err: any) {
      console.error(`[LongSell] Error for ${cardBrand}:`, err.message);
      const responseData = err.response?.data;
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