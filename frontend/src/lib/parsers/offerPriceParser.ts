import type { PriceSnapshot, FlightPriceBreakdown, TaxFeeItem } from '@/components/pricing';

// Offer item from OfferPrice response - used for OrderCreate
export interface OfferPriceOfferItem {
  offerItemId: string;
  paxRefIds: string[];
  segmentRefIds?: string[];
  baseAmount?: { value: number; currency: string };
  taxAmount?: { value: number; currency: string };
  totalAmount?: { value: number; currency: string };
}

// Priced offer from OfferPrice response - used for OrderCreate
export interface PricedOffer {
  offerId: string;
  ownerCode: string;
  responseId?: string;
  totalPrice?: { value: number; currency: string };
  offerItems: OfferPriceOfferItem[];
}

export interface ParsedOfferPriceResponse {
  offerId: string;
  totalAmount: number;
  currency: string;
  breakdown: {
    base: number;
    taxes: number;
    fees: number;
    services?: number;
    seats?: number;
  };
  paymentFees?: Array<{
    paymentType: string;
    paymentCode: string;
    feeType: 'fixed' | 'percentage' | 'none';
    feeAmount?: number;
    feePercentage?: number;
  }>;
  priceGuaranteeExpiry?: string;
  warnings?: string[];
  // Detailed flight-level breakdown for price verification
  flightBreakdowns?: FlightPriceBreakdown[];
  // Priced offers with offer items - needed for OrderCreate
  pricedOffers?: PricedOffer[];
}

export function parseOfferPriceResponse(data: any): ParsedOfferPriceResponse {
  const response = data.parsed || data;

  // Extract pricing info
  const pricing = response.pricing || response.Pricing || response;
  const total = response.totalAmount || response.TotalAmount || pricing.total || 0;

  // Parse flight breakdowns from backend
  const flightBreakdowns = parseFlightBreakdowns(response.flightBreakdowns || []);

  // Parse priced offers for OrderCreate - includes offerItems with offerItemId and paxRefIds
  const pricedOffers = parsePricedOffers(response.pricedOffers || []);

  return {
    offerId: response.offerId || response.OfferID || '',
    totalAmount: parseFloat(total),
    currency: response.currency || response.Currency || 'AUD',
    breakdown: {
      base: parseFloat(pricing.baseFare || pricing.base || 0),
      taxes: parseFloat(pricing.taxes || pricing.tax || 0),
      fees: parseFloat(pricing.fees || pricing.surcharges || 0),
      services: pricing.services ? parseFloat(pricing.services) : undefined,
      seats: pricing.seats ? parseFloat(pricing.seats) : undefined,
    },
    paymentFees: parsePaymentFees(response.paymentFees || response.PaymentFees || []),
    priceGuaranteeExpiry: response.priceGuaranteeExpiry || response.PriceGuaranteeExpiry,
    warnings: response.warnings || [],
    flightBreakdowns: flightBreakdowns.length > 0 ? flightBreakdowns : undefined,
    pricedOffers: pricedOffers.length > 0 ? pricedOffers : undefined,
  };
}

/**
 * Parse priced offers from backend response
 * These contain the offer items needed for OrderCreate
 */
function parsePricedOffers(offers: any[]): PricedOffer[] {
  if (!Array.isArray(offers)) return [];

  return offers.map((offer): PricedOffer => ({
    offerId: offer.offerId || offer.OfferID || '',
    ownerCode: offer.ownerCode || offer.OwnerCode || 'JQ',
    responseId: offer.responseId || offer.ResponseID,
    totalPrice: offer.totalPrice ? {
      value: parseFloat(offer.totalPrice.value || 0),
      currency: offer.totalPrice.currency || 'AUD',
    } : undefined,
    offerItems: (offer.offerItems || []).map((item: any): OfferPriceOfferItem => ({
      offerItemId: item.offerItemId || item.OfferItemID || '',
      paxRefIds: item.paxRefIds || item.PaxRefIDs || [],
      segmentRefIds: item.segmentRefIds || item.SegmentRefIDs,
      baseAmount: item.baseAmount ? {
        value: parseFloat(item.baseAmount.value || 0),
        currency: item.baseAmount.currency || 'AUD',
      } : undefined,
      taxAmount: item.taxAmount ? {
        value: parseFloat(item.taxAmount.value || 0),
        currency: item.taxAmount.currency || 'AUD',
      } : undefined,
      totalAmount: item.totalAmount ? {
        value: parseFloat(item.totalAmount.value || 0),
        currency: item.totalAmount.currency || 'AUD',
      } : undefined,
    })),
  }));
}

function parseFlightBreakdowns(breakdowns: any[]): FlightPriceBreakdown[] {
  if (!Array.isArray(breakdowns)) return [];

  return breakdowns.map((b) => ({
    flightNumber: b.flightNumber || 1,
    route: b.route || 'Unknown',
    segmentIds: b.segmentIds || [],
    publishedFare: {
      label: b.publishedFare?.label || 'Published Fare',
      baseFare: parseFloat(b.publishedFare?.baseFare || 0),
      discountedBaseFare: parseFloat(b.publishedFare?.discountedBaseFare || b.publishedFare?.baseFare || 0),
      surcharges: parseFloat(b.publishedFare?.surcharges || 0),
      adjustments: parseFloat(b.publishedFare?.adjustments || 0),
      total: parseFloat(b.publishedFare?.total || 0),
    },
    feesAndTaxes: (b.feesAndTaxes || []).map((t: any): TaxFeeItem => ({
      code: t.code || '',
      name: t.name || t.code || 'Unknown',
      amount: parseFloat(t.amount || 0),
      currency: t.currency || 'AUD',
    })),
    totalFeesAndTaxes: parseFloat(b.totalFeesAndTaxes || 0),
    flightTotal: parseFloat(b.flightTotal || 0),
    currency: b.currency || 'AUD',
    passengerBreakdown: b.passengerBreakdown || [],
  }));
}

function parsePaymentFees(fees: any[]): ParsedOfferPriceResponse['paymentFees'] {
  return fees.map((fee) => ({
    paymentType: fee.paymentType || fee.PaymentType || fee.name || '',
    paymentCode: fee.paymentCode || fee.PaymentCode || fee.code || '',
    feeType: fee.feeType || fee.FeeType || 'none',
    feeAmount: fee.feeAmount ? parseFloat(fee.feeAmount) : undefined,
    feePercentage: fee.feePercentage ? parseFloat(fee.feePercentage) : undefined,
  }));
}

export function createPriceSnapshot(
  label: string,
  response: ParsedOfferPriceResponse
): PriceSnapshot {
  return {
    label,
    amount: response.totalAmount,
    currency: response.currency,
    timestamp: new Date(),
    breakdown: response.breakdown,
  };
}
