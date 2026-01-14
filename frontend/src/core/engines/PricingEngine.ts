import type { PriceBreakdown, PricingSnapshot } from '@/core/types';

// ============================================================================
// PRICE COMPARISON
// ============================================================================

export interface PriceComparison {
  checkpoints: PricingSnapshot[];
  differences: PriceDifference[];
  initialPrice: number;
  finalPrice: number;
  totalChange: number;
  changePercentage: number;
}

export interface PriceDifference {
  fromStep: string;
  toStep: string;
  category: 'flight' | 'bundle' | 'ancillary' | 'seat' | 'tax' | 'fee' | 'discount' | 'payment';
  item: string;
  previousAmount: number;
  currentAmount: number;
  difference: number;
  reason?: string;
}

/**
 * Compare prices across workflow checkpoints
 */
export function comparePrices(snapshots: PricingSnapshot[]): PriceComparison {
  if (snapshots.length === 0) {
    return {
      checkpoints: [],
      differences: [],
      initialPrice: 0,
      finalPrice: 0,
      totalChange: 0,
      changePercentage: 0,
    };
  }

  const differences: PriceDifference[] = [];
  
  // Compare consecutive snapshots
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1].breakdown;
    const curr = snapshots[i].breakdown;
    
    // Compare flight total
    if (prev.flights.total !== curr.flights.total) {
      differences.push({
        fromStep: snapshots[i - 1].stepId,
        toStep: snapshots[i].stepId,
        category: 'flight',
        item: 'Flight Fare',
        previousAmount: prev.flights.total,
        currentAmount: curr.flights.total,
        difference: curr.flights.total - prev.flights.total,
      });
    }
    
    // Compare bundles
    const prevBundleTotal = prev.bundles.reduce((sum, b) => sum + b.price, 0);
    const currBundleTotal = curr.bundles.reduce((sum, b) => sum + b.price, 0);
    if (prevBundleTotal !== currBundleTotal) {
      differences.push({
        fromStep: snapshots[i - 1].stepId,
        toStep: snapshots[i].stepId,
        category: 'bundle',
        item: 'Bundles',
        previousAmount: prevBundleTotal,
        currentAmount: currBundleTotal,
        difference: currBundleTotal - prevBundleTotal,
      });
    }
    
    // Compare ancillaries
    const prevAncTotal = prev.ancillaries.reduce((sum, a) => sum + a.price, 0);
    const currAncTotal = curr.ancillaries.reduce((sum, a) => sum + a.price, 0);
    if (prevAncTotal !== currAncTotal) {
      differences.push({
        fromStep: snapshots[i - 1].stepId,
        toStep: snapshots[i].stepId,
        category: 'ancillary',
        item: 'Extras',
        previousAmount: prevAncTotal,
        currentAmount: currAncTotal,
        difference: currAncTotal - prevAncTotal,
      });
    }
    
    // Compare seats
    const prevSeatTotal = prev.seats.reduce((sum, s) => sum + s.price, 0);
    const currSeatTotal = curr.seats.reduce((sum, s) => sum + s.price, 0);
    if (prevSeatTotal !== currSeatTotal) {
      differences.push({
        fromStep: snapshots[i - 1].stepId,
        toStep: snapshots[i].stepId,
        category: 'seat',
        item: 'Seats',
        previousAmount: prevSeatTotal,
        currentAmount: currSeatTotal,
        difference: currSeatTotal - prevSeatTotal,
      });
    }
    
    // Compare payment surcharge
    const prevPayment = prev.paymentSurcharge?.amount || 0;
    const currPayment = curr.paymentSurcharge?.amount || 0;
    if (prevPayment !== currPayment) {
      differences.push({
        fromStep: snapshots[i - 1].stepId,
        toStep: snapshots[i].stepId,
        category: 'payment',
        item: 'Card Fee',
        previousAmount: prevPayment,
        currentAmount: currPayment,
        difference: currPayment - prevPayment,
      });
    }
  }

  const initialPrice = snapshots[0].breakdown.grandTotal;
  const finalPrice = snapshots[snapshots.length - 1].breakdown.grandTotal;
  const totalChange = finalPrice - initialPrice;
  const changePercentage = initialPrice > 0 ? (totalChange / initialPrice) * 100 : 0;

  return {
    checkpoints: snapshots,
    differences,
    initialPrice,
    finalPrice,
    totalChange,
    changePercentage,
  };
}

// ============================================================================
// PAYMENT FEE DETECTION
// ============================================================================

export interface PaymentFeeAnalysis {
  feeType: 'FIXED' | 'PERCENTAGE' | 'MIXED' | 'UNKNOWN';
  fixedAmount?: number;
  percentage?: number;
  samples: PaymentFeeSample[];
}

export interface PaymentFeeSample {
  cardType: string;
  cardName: string;
  baseTotal: number;
  surcharge: number;
  finalTotal: number;
  calculatedPercentage: number;
}

/**
 * Detect payment fee structure by comparing VI and MC results
 * 
 * Strategy:
 * 1. Call OfferPrice with VI
 * 2. Call OfferPrice with MC
 * 3. Compare surcharges:
 *    - If equal: FIXED fee
 *    - If different but consistent %: PERCENTAGE fee
 *    - Otherwise: MIXED or unknown
 */
export function analyzePaymentFees(samples: PaymentFeeSample[]): PaymentFeeAnalysis {
  if (samples.length === 0) {
    return { feeType: 'UNKNOWN', samples: [] };
  }

  if (samples.length === 1) {
    const sample = samples[0];
    if (sample.surcharge === 0) {
      return { feeType: 'FIXED', fixedAmount: 0, samples };
    }
    return {
      feeType: 'UNKNOWN',
      samples,
    };
  }

  // Check if all surcharges are the same (FIXED)
  const uniqueSurcharges = new Set(samples.map(s => s.surcharge.toFixed(2)));
  if (uniqueSurcharges.size === 1) {
    return {
      feeType: 'FIXED',
      fixedAmount: samples[0].surcharge,
      samples,
    };
  }

  // Check if percentages are consistent (PERCENTAGE)
  const percentages = samples.map(s => s.calculatedPercentage);
  const avgPercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
  const percentageTolerance = 0.1; // 0.1% tolerance
  
  const isPercentageBased = percentages.every(
    p => Math.abs(p - avgPercentage) <= percentageTolerance
  );

  if (isPercentageBased) {
    return {
      feeType: 'PERCENTAGE',
      percentage: Math.round(avgPercentage * 100) / 100, // Round to 2 decimal places
      samples,
    };
  }

  return {
    feeType: 'MIXED',
    samples,
  };
}

/**
 * Calculate surcharge for a given amount based on fee analysis
 */
export function calculateSurcharge(
  amount: number,
  analysis: PaymentFeeAnalysis
): number {
  switch (analysis.feeType) {
    case 'FIXED':
      return analysis.fixedAmount || 0;
    case 'PERCENTAGE':
      return amount * ((analysis.percentage || 0) / 100);
    default:
      // For MIXED or UNKNOWN, use average from samples
      if (analysis.samples.length > 0) {
        const avgPercentage = analysis.samples.reduce(
          (sum, s) => sum + s.calculatedPercentage, 0
        ) / analysis.samples.length;
        return amount * (avgPercentage / 100);
      }
      return 0;
  }
}

// ============================================================================
// PRICE BREAKDOWN HELPERS
// ============================================================================

/**
 * Create an empty price breakdown
 */
export function createEmptyBreakdown(currency: string = 'AUD'): PriceBreakdown {
  return {
    currency,
    grandTotal: 0,
    flights: { baseFare: 0, taxTotal: 0, feeTotal: 0, total: 0 },
    bundles: [],
    ancillaries: [],
    seats: [],
    taxes: [],
    fees: [],
    discounts: [],
  };
}

/**
 * Calculate grand total from breakdown components
 */
export function calculateGrandTotal(breakdown: PriceBreakdown): number {
  const flightTotal = breakdown.flights.total;
  const bundleTotal = breakdown.bundles.reduce((sum, b) => sum + b.price, 0);
  const ancillaryTotal = breakdown.ancillaries.reduce((sum, a) => sum + a.price, 0);
  const seatTotal = breakdown.seats.reduce((sum, s) => sum + s.price, 0);
  const discountTotal = breakdown.discounts.reduce((sum, d) => sum + d.amount, 0);
  const paymentFee = breakdown.paymentSurcharge?.amount || 0;

  return flightTotal + bundleTotal + ancillaryTotal + seatTotal - discountTotal + paymentFee;
}
