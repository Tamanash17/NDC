// ============================================================================
// BOOKING DATA TRANSFORMER
// Transforms raw NDC OrderViewRS data into display component props
// ============================================================================

import type { OverallHealth } from '@/components/booking/BookingStatusBanner';
import type { FlightJourney, FlightSegment, PassengerServices } from '@/components/booking/FlightJourneyTimeline';
import type { PassengerData, PassengerService } from '@/components/booking/PassengerDetailsCard';
import type { PaymentStatus, PaymentMethod, PriceBreakdownItem } from '@/components/booking/PaymentSummaryCard';

// ----------------------------------------------------------------------------
// STATUS TRANSFORMERS
// ----------------------------------------------------------------------------

export interface OrderWarning {
  code?: string;
  message: string;
}

export interface BookingStatusData {
  health: OverallHealth;
  headline: string;
  subheadline: string;
  actionRequired?: string;
  urgentDeadline?: {
    type: 'payment' | 'ticketing' | 'check-in';
    datetime: string;
    message: string;
  };
  paymentStatus?: { code: string; label: string };
  orderStatus?: { code: string; label: string };
  deliveryStatus?: { code: string; label: string };
  warnings?: OrderWarning[];
}

export function transformBookingStatus(rawData: any): BookingStatusData {
  // Extract raw status codes - check multiple possible paths
  // Backend returns data directly (not nested in order object)
  // rawData.status is the order status from backend parser
  // Note: Backend already derives effective status from payment info
  // (If payment is SUCCESSFUL but XML has OPENED, backend returns CONFIRMED)
  const orderStatusRaw = rawData?.status ||  // Direct from backend parsed data
                         rawData?.order?.status ||
                         rawData?.Response?.Order?.StatusCode ||
                         rawData?.Order?.StatusCode || 'OK';

  const paymentStatusRaw = extractPaymentStatus(rawData);

  const deliveryStatusRaw = extractDeliveryStatus(rawData);

  // Determine overall health
  const health = determineHealth(paymentStatusRaw, orderStatusRaw, deliveryStatusRaw);

  // Generate headlines
  const { headline, subheadline } = generateHeadlines(paymentStatusRaw, orderStatusRaw, deliveryStatusRaw, rawData);

  // Check for action required
  const actionRequired = determineActionRequired(paymentStatusRaw, orderStatusRaw, rawData);

  // Check for urgent deadlines
  const urgentDeadline = checkUrgentDeadlines(rawData);

  // Extract warnings from backend response
  const warnings = extractWarnings(rawData);

  return {
    health,
    headline,
    subheadline,
    actionRequired,
    urgentDeadline,
    paymentStatus: {
      code: paymentStatusRaw,
      label: formatStatusLabel(paymentStatusRaw, 'payment'),
    },
    orderStatus: {
      code: orderStatusRaw,
      label: formatStatusLabel(orderStatusRaw, 'order'),
    },
    deliveryStatus: {
      code: deliveryStatusRaw,
      label: formatStatusLabel(deliveryStatusRaw, 'delivery'),
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function extractWarnings(data: any): OrderWarning[] {
  const warnings: OrderWarning[] = [];

  // Backend parsed format uses lowercase 'warnings' array with { code, message }
  const rawWarnings = normalizeToArray(data?.warnings || data?.Response?.Warning || data?.Warning);

  for (const w of rawWarnings) {
    const message = w?.message || w?.DescText || '';
    const code = w?.code || w?.TypeCode || undefined;

    if (message) {
      warnings.push({ code, message });
    }
  }

  return warnings;
}

function extractPaymentStatus(data: any): string {
  // FIRST: Check backend-parsed paymentInfo (from PaymentProcessingSummary)
  // This is the most reliable source - it's the actual payment result
  const backendPaymentInfo = data?.paymentInfo;
  if (backendPaymentInfo?.status) {
    // Map backend status to our format
    if (backendPaymentInfo.status === 'SUCCESSFUL') return 'SUCCESSFUL';
    if (backendPaymentInfo.status === 'PENDING') return 'PENDING';
    if (backendPaymentInfo.status === 'FAILED') return 'FAILED';
  }

  // Check for warnings - "Order is underpaid" is critical
  // Backend parsed format uses lowercase 'warnings' array with { code, message }
  const warnings = normalizeToArray(data?.warnings || data?.Response?.Warning || data?.Warning);

  const hasUnderpaidWarning = warnings.some((w: any) => {
    const msgLower = (w?.message || w?.DescText || '').toLowerCase();
    const codeMatch = w?.code === 'OF2003' || w?.TypeCode === 'OF2003';
    return msgLower.includes('underpaid') || codeMatch;
  });

  // Get order status - OPENED means hold booking (not paid)
  // Backend returns status directly in data (not nested)
  const orderStatus = data?.status ||  // Direct from backend parsed data
                      data?.order?.status ||
                      data?.Response?.Order?.StatusCode ||
                      data?.Order?.StatusCode || '';

  // OPENED status = hold booking, payment required (only if no successful payment)
  if ((orderStatus === 'OPENED' || hasUnderpaidWarning) && !backendPaymentInfo?.status) {
    return 'PENDING';
  }

  // Check for explicit payment info in legacy format
  const paymentInfo = data?.Response?.PaymentInfo ||
                      data?.PaymentInfo ||
                      data?.order?.PaymentInfo;

  if (paymentInfo) {
    const statusCode = paymentInfo?.PaymentProcessingDetails?.PaymentStatusCode ||
                       paymentInfo?.PaymentStatusCode ||
                       paymentInfo?.Status;
    if (statusCode) return statusCode.toUpperCase();
  }

  // Check if order has payment time limit (hold booking)
  const orderItems = normalizeToArray(data?.Response?.Order?.OrderItem || data?.Order?.OrderItem || data?.order?.OrderItem);
  const timeLimit = orderItems[0]?.PaymentTimeLimitDateTime || data?.paymentTimeLimit;
  if (timeLimit && !backendPaymentInfo?.status) {
    const deadline = new Date(timeLimit);
    if (deadline > new Date()) return 'PENDING';
  }

  // Check order status for paid states
  if (orderStatus === 'TICKETED' || orderStatus === 'TK') return 'SUCCESSFUL';
  if (orderStatus === 'CANCELLED' || orderStatus === 'XX') return 'UNKNOWN';
  if (orderStatus === 'CONFIRMED' || orderStatus === 'OK' || orderStatus === 'HK') return 'SUCCESSFUL';

  return 'UNKNOWN';
}

function extractDeliveryStatus(data: any): string {
  const deliveryInfo = data?.Response?.DeliveryInfo ||
                       data?.DeliveryInfo ||
                       data?.order?.DeliveryInfo;

  if (deliveryInfo) {
    return deliveryInfo?.StatusCode || deliveryInfo?.Status || 'CONFIRMED';
  }

  // Infer from order status
  const orderStatus = data?.order?.StatusCode || 'OK';
  if (orderStatus === 'TICKETED' || orderStatus === 'TK') return 'CONFIRMED';

  return 'READY_TO_PROCEED';
}

function determineHealth(payment: string, order: string, _delivery: string): OverallHealth {
  // Error states
  if (payment === 'FAILED' || order === 'CANCELLED' || order === 'XX') return 'error';

  // Success states - payment SUCCESSFUL overrides order status
  // Even if order is OPENED, if payment is SUCCESSFUL, booking is good
  if (payment === 'SUCCESSFUL') {
    return 'success';
  }

  // Warning states - PENDING payment = awaiting payment
  if (payment === 'PENDING' || payment === 'PARTIAL') return 'warning';

  // Success states based on order status
  if ((payment === 'UNKNOWN') &&
      (order === 'CONFIRMED' || order === 'TICKETED' || order === 'OK' || order === 'TK' || order === 'HK')) {
    return 'success';
  }

  return 'info';
}

function generateHeadlines(payment: string, order: string, _delivery: string, data: any): { headline: string; subheadline: string } {
  if (payment === 'FAILED') {
    return {
      headline: 'Payment Unsuccessful',
      subheadline: 'Your payment could not be processed. Please try again with a different payment method.',
    };
  }

  if (order === 'CANCELLED' || order === 'XX') {
    return {
      headline: 'Booking Cancelled',
      subheadline: payment === 'REFUNDED'
        ? 'Your booking has been cancelled and refunded.'
        : 'This booking has been cancelled.',
    };
  }

  // Payment SUCCESSFUL overrides order status OPENED
  // (Jetstar sometimes returns OPENED even after successful payment)
  if (payment === 'SUCCESSFUL') {
    return {
      headline: 'Booking Confirmed',
      subheadline: 'Your payment has been processed successfully.',
    };
  }

  // OPENED = Hold booking, PENDING payment (only if payment not successful)
  if (payment === 'PENDING') {
    // Backend parsed format uses order.paymentTimeLimit
    const timeLimit = data?.order?.paymentTimeLimit ||
                      data?.Response?.Order?.OrderItem?.[0]?.PaymentTimeLimitDateTime ||
                      data?.Order?.OrderItem?.[0]?.PaymentTimeLimitDateTime;
    const deadline = timeLimit ? formatDeadline(timeLimit) : 'soon';

    // Backend parsed format uses order.totalPrice { value, currency }
    const totalPrice = data?.order?.totalPrice ||
                       data?.Response?.Order?.TotalPrice?.TotalAmount ||
                       data?.Order?.TotalPrice?.TotalAmount;
    let amount = '';
    if (totalPrice?.value !== undefined) {
      amount = ` (${getCurrencySymbol(totalPrice.currency || 'AUD')}${totalPrice.value.toFixed(2)})`;
    } else if (totalPrice) {
      amount = ` (${getCurrencySymbol(totalPrice['@CurCode'] || totalPrice?.CurCode || 'AUD')}${parseFloat(totalPrice['#text'] || totalPrice || 0).toFixed(2)})`;
    }

    return {
      headline: 'Payment Required',
      subheadline: `Complete payment${amount} by ${deadline} to secure your booking.`,
    };
  }

  if (order === 'TICKETED' || order === 'TK') {
    return {
      headline: "You're All Set!",
      subheadline: 'Your tickets have been issued. Check your email for your e-ticket confirmation.',
    };
  }

  if (order === 'CONFIRMED' || order === 'OK' || order === 'HK') {
    return {
      headline: 'Booking Confirmed',
      subheadline: 'Your seats are secured. Have a great flight!',
    };
  }

  return {
    headline: 'Booking Details',
    subheadline: 'View your complete itinerary below.',
  };
}

function determineActionRequired(payment: string, order: string, _data: any): string | undefined {
  if (payment === 'FAILED') return 'Please retry payment with a different card or payment method.';
  if (payment === 'PENDING') return 'Complete payment before the deadline to avoid automatic cancellation.';
  if (payment === 'PARTIAL') return 'Please complete the remaining payment to confirm your booking.';
  return undefined;
}

function checkUrgentDeadlines(data: any): BookingStatusData['urgentDeadline'] {
  // Backend parsed format uses order.paymentTimeLimit
  const timeLimit = data?.order?.paymentTimeLimit ||
                    data?.Response?.Order?.OrderItem?.[0]?.PaymentTimeLimitDateTime ||
                    data?.Order?.OrderItem?.[0]?.PaymentTimeLimitDateTime ||
                    data?.order?.OrderItem?.[0]?.PaymentTimeLimitDateTime;

  if (!timeLimit) return undefined;

  const deadline = new Date(timeLimit);
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    return { type: 'payment', datetime: timeLimit, message: 'Payment deadline has passed!' };
  }

  if (hoursRemaining <= 24) {
    const hours = Math.floor(hoursRemaining);
    const mins = Math.floor((hoursRemaining - hours) * 60);
    return {
      type: 'payment',
      datetime: timeLimit,
      message: hours > 0 ? `Payment due in ${hours}h ${mins}m` : `Payment due in ${mins} minutes!`,
    };
  }

  return undefined;
}

function formatDeadline(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatStatusLabel(code: string, type: 'payment' | 'order' | 'delivery'): string {
  // ==========================================================================
  // NDC STATUS CODE REFERENCE (Jetstar/Navitaire NDC Gateway)
  // ==========================================================================
  //
  // PAYMENT STATUS (from PaymentProcessingSummary/PaymentStatusCode):
  //   SUCCESSFUL - Payment has been successfully accepted
  //   PENDING    - Payment committed, pending approval (must poll OrderRetrieve)
  //   FAILED     - Payment has been declined
  //
  // ORDER STATUS (from Order/StatusCode):
  //   OPENED     - Hold, Confirmed (order is active, awaiting payment)
  //   CLOSED     - Closed, HoldCancelled (order cancelled or expired)
  //   Note: OPENED does NOT mean incomplete - it's a confirmed hold booking
  //
  // ORDER ITEM STATUS (from OrderItem/StatusCode):
  //   ACTIVE     - OrderItem expected to be delivered
  //   CANCELLED  - OrderItem has been cancelled
  //
  // SERVICE ITEM DELIVERY STATUS (from Service/DeliveryStatusCode):
  //   CONFIRMED        - Unpaid/Underpaid OrderItems (payment required)
  //   READY TO PROCEED - Fully paid/Overpaid OrderItems (ready for travel)
  //
  // ==========================================================================

  const labels: Record<string, Record<string, string>> = {
    // Payment status from PaymentProcessingSummary/PaymentStatusCode
    payment: {
      SUCCESSFUL: 'Paid',           // Payment accepted
      SUCCESS: 'Paid',              // Alias
      COMPLETED: 'Paid',            // Alias
      PENDING: 'Awaiting Payment',  // Payment committed but pending approval
      FAILED: 'Failed',             // Payment declined
      REFUNDED: 'Refunded',         // Payment refunded
      PARTIAL: 'Partial',           // Partial payment
      UNKNOWN: 'Unknown',           // No payment info available
    },
    // Order status from Order/StatusCode
    order: {
      OK: 'Confirmed',              // IATA code - confirmed
      HK: 'Confirmed',              // IATA code - holding confirmed
      CONFIRMED: 'Confirmed',       // Booking confirmed and paid
      TICKETED: 'Ticketed',         // Tickets issued
      TK: 'Ticketed',               // IATA code - ticketed
      CANCELLED: 'Cancelled',       // Order cancelled
      XX: 'Cancelled',              // IATA code - cancelled
      OPENED: 'On Hold',            // NDC: Hold, Confirmed - awaiting payment
      CLOSED: 'Closed',             // NDC: Closed, HoldCancelled
      PENDING: 'Pending',           // Awaiting confirmation
    },
    // Service delivery status from Service/DeliveryStatusCode
    delivery: {
      // Per Jetstar NDC docs (Table 6):
      // CONFIRMED = Unpaid/Underpaid OrderItems
      // READY TO PROCEED = Fully paid/Overpaid OrderItems
      CONFIRMED: 'Pending',         // Unpaid - payment still required
      READY_TO_PROCEED: 'Ready',    // Fully paid - ready for travel
      RTP: 'Ready',                 // Alias for READY_TO_PROCEED
      DELIVERED: 'Sent',            // Tickets/docs delivered
      PENDING: 'Pending',           // Awaiting processing
    },
  };

  return labels[type][code] || code;
}

// ----------------------------------------------------------------------------
// FLIGHT JOURNEY TRANSFORMER
// ----------------------------------------------------------------------------

export function transformFlightJourneys(rawData: any): FlightJourney[] {
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const paxJourneys = normalizeToArray(dataLists?.PaxJourneyList?.PaxJourney);
  const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);
  const paxSegments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);

  if (paxJourneys.length === 0 && marketingSegments.length > 0) {
    // Fallback: Create journey from segments if no PaxJourney list
    return [{
      journeyId: 'journey-1',
      direction: 'outbound',
      origin: marketingSegments[0]?.Dep?.IATA_LocationCode || '',
      destination: marketingSegments[marketingSegments.length - 1]?.Arrival?.IATA_LocationCode || '',
      departureDate: marketingSegments[0]?.Dep?.AircraftScheduledDateTime || '',
      segments: marketingSegments.map((seg: any) => transformSegment(seg)),
    }];
  }

  return paxJourneys.map((journey: any, idx: number) => {
    const segmentRefIds = normalizeToArray(journey.PaxSegmentRefID);

    // Get marketing segments for this journey
    const journeyMarketingSegments = segmentRefIds
      .map((refId: string) => {
        const paxSeg = paxSegments.find((ps: any) => ps.PaxSegmentID === refId);
        const mktSegId = paxSeg?.DatedMarketingSegmentRefId;
        return marketingSegments.find((ms: any) => ms.DatedMarketingSegmentId === mktSegId);
      })
      .filter(Boolean);

    const firstSegment = journeyMarketingSegments[0];
    const lastSegment = journeyMarketingSegments[journeyMarketingSegments.length - 1];

    return {
      journeyId: journey.PaxJourneyID || `journey-${idx + 1}`,
      direction: idx === 0 ? 'outbound' : idx === 1 ? 'return' : 'multi',
      origin: firstSegment?.Dep?.IATA_LocationCode || '',
      destination: lastSegment?.Arrival?.IATA_LocationCode || '',
      departureDate: firstSegment?.Dep?.AircraftScheduledDateTime || '',
      segments: journeyMarketingSegments.map((seg: any) => transformSegment(seg)),
      totalDuration: journey.Duration,
    } as FlightJourney;
  });
}

function transformSegment(marketingSeg: any): FlightSegment {
  return {
    segmentId: marketingSeg?.DatedMarketingSegmentId || '',
    origin: marketingSeg?.Dep?.IATA_LocationCode || '',
    destination: marketingSeg?.Arrival?.IATA_LocationCode || '',
    departureDateTime: marketingSeg?.Dep?.AircraftScheduledDateTime || '',
    arrivalDateTime: marketingSeg?.Arrival?.AircraftScheduledDateTime || '',
    flightNumber: marketingSeg?.MarketingCarrierFlightNumberText || '',
    carrierCode: marketingSeg?.CarrierDesigCode || '',
    duration: marketingSeg?.Duration,
  };
}

// ----------------------------------------------------------------------------
// PASSENGER TRANSFORMER
// ----------------------------------------------------------------------------

export function transformPassengers(rawData: any): PassengerData[] {
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const paxList = normalizeToArray(dataLists?.PaxList?.Pax);
  const orderItems = normalizeToArray(rawData?.Response?.Order?.OrderItem || rawData?.Order?.OrderItem || rawData?.order?.OrderItem);

  return paxList.map((pax: any) => {
    const individual = pax.Individual || {};

    // Extract services for this passenger
    const services = extractPassengerServices(pax.PaxID, orderItems, dataLists);

    return {
      paxId: pax.PaxID || '',
      ptc: pax.PTC || 'ADT',
      title: individual.Title,
      givenName: individual.GivenName || '',
      middleName: individual.MiddleName,
      surname: individual.Surname || '',
      birthdate: individual.Birthdate || '',
      gender: individual.GenderCode || 'U',
      email: pax.ContactInfo?.EmailAddress?.EmailAddressText,
      phone: pax.ContactInfo?.Phone?.PhoneNumber,
      identityDoc: pax.IdentityDoc ? {
        type: pax.IdentityDoc.IdentityDocTypeCode === 'PT' ? 'PP' : pax.IdentityDoc.IdentityDocTypeCode,
        number: pax.IdentityDoc.IdentityDocID || '',
        expiryDate: pax.IdentityDoc.ExpiryDate || '',
        issuingCountry: pax.IdentityDoc.IssuingCountryCode || '',
        nationality: pax.IdentityDoc.CitizenshipCountryCode,
      } : undefined,
      loyalty: pax.LoyaltyProgramAccount ? {
        programOwner: pax.LoyaltyProgramAccount.LoyaltyProgram?.Carrier?.AirlineDesigCode || '',
        accountNumber: pax.LoyaltyProgramAccount.AccountNumber || '',
        tierLevel: pax.LoyaltyProgramAccount.TierLevel,
      } : undefined,
      services,
      infantAssocPaxId: pax.AssociatedPaxID,
    } as PassengerData;
  });
}

function extractPassengerServices(paxId: string, orderItems: any[], dataLists: any): PassengerService[] {
  const services: PassengerService[] = [];
  const serviceDefinitions = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);

  orderItems.forEach((item: any) => {
    const paxRefIds = normalizeToArray(item.PaxRefID);
    if (!paxRefIds.includes(paxId)) return;

    const itemId = item.OrderItemID || '';

    // Check if it's a seat
    if (itemId.includes('SEAT') || item.Service?.SeatAssignment) {
      const seat = item.Service?.SeatAssignment?.Seat;
      if (seat) {
        services.push({
          type: 'seat',
          description: `Seat ${seat.RowNumber}${seat.ColumnID}`,
          segmentId: item.Service?.PaxSegmentRefID,
        });
      }
    }

    // Check for other services
    const serviceRefId = item.Service?.ServiceDefinitionRefID;
    if (serviceRefId) {
      const serviceDef = serviceDefinitions.find((sd: any) => sd.ServiceDefinitionID === serviceRefId);
      if (serviceDef) {
        const serviceType = determineServiceType(serviceDef);
        services.push({
          type: serviceType,
          description: serviceDef.Name || serviceDef.DescText || serviceRefId,
          code: serviceDef.ServiceCode,
          segmentId: item.Service?.PaxSegmentRefID,
        });
      }
    }
  });

  return services;
}

function determineServiceType(serviceDef: any): 'seat' | 'baggage' | 'meal' | 'other' {
  const code = (serviceDef.ServiceCode || '').toUpperCase();
  const name = (serviceDef.Name || '').toUpperCase();

  if (code.includes('BAG') || name.includes('BAGGAGE') || name.includes('LUGGAGE')) return 'baggage';
  if (code.includes('MEAL') || name.includes('MEAL') || name.includes('FOOD')) return 'meal';
  if (code.includes('SEAT') || name.includes('SEAT')) return 'seat';

  return 'other';
}

// ----------------------------------------------------------------------------
// PAYMENT TRANSFORMER
// ----------------------------------------------------------------------------

export interface PaymentTransactionData {
  transactionId?: string;
  status: PaymentStatus;
  amount: { value: number; currency: string };
  surchargeAmount?: { value: number; currency: string };
  method?: PaymentMethod;
}

export interface PaymentData {
  status: PaymentStatus;
  method?: PaymentMethod;
  totalAmount: { value: number; currency: string };
  amountPaid?: { value: number; currency: string };
  amountDue?: { value: number; currency: string };
  breakdown?: PriceBreakdownItem[];
  transactions?: PaymentTransactionData[];
}

export function transformPaymentData(rawData: any): PaymentData {
  // Backend returns data directly (not nested in order object)
  const orderItems = normalizeToArray(rawData?.orderItems || rawData?.order?.orderItems || rawData?.Order?.OrderItem);

  // FIRST: Check backend-parsed paymentInfo (from PaymentProcessingSummary)
  // This is the authoritative source for payment status and amounts
  const backendPaymentInfo = rawData?.paymentInfo;
  const legacyPaymentInfo = rawData?.Response?.PaymentInfo || rawData?.PaymentInfo;

  // Get total - backend returns totalPrice directly on data object
  const orderTotal = rawData?.totalPrice ||  // Direct from backend
                     rawData?.order?.totalPrice ||
                     rawData?.Order?.TotalPrice?.TotalAmount;

  let totalValue = 0;
  let currency = 'AUD';

  // Handle backend parsed format: { value, currency }
  if (orderTotal?.value !== undefined) {
    totalValue = orderTotal.value;
    currency = orderTotal.currency || 'AUD';
  } else if (orderTotal) {
    // Handle both {#text, @CurCode} and plain value formats
    totalValue = parseFloat(orderTotal['#text'] || orderTotal || 0);
    currency = orderTotal['@CurCode'] || orderTotal?.CurCode || 'AUD';
  }

  // Build breakdown from order items
  const breakdown: PriceBreakdownItem[] = [];

  orderItems.forEach((item: any) => {
    const price = item.Price || {};
    const baseAmount = parseFloat(price.BaseAmount?.['#text'] || price.BaseAmount || 0);
    const itemTotal = parseFloat(price.TotalAmount?.['#text'] || price.TotalAmount || 0);
    const itemCurrency = price.TotalAmount?.['@CurCode'] || price.BaseAmount?.['@CurCode'] || currency;

    // If no order total, sum from items
    if (!orderTotal) {
      totalValue += itemTotal;
    }

    // Add base fare or service to breakdown
    if (baseAmount > 0) {
      const itemId = item.OrderItemID || '';
      const isFlight = itemId.includes('FLIGHT');
      breakdown.push({
        label: isFlight ? 'Base Fare' : (itemId.split('-').pop() || 'Service'),
        type: isFlight ? 'base' : 'service',
        amount: baseAmount,
        currency: itemCurrency,
      });
    }

    // Add fees
    const fees = normalizeToArray(price.Fee);
    fees.forEach((fee: any) => {
      breakdown.push({
        label: fee.DescText || 'Fee',
        type: 'fee',
        amount: parseFloat(fee.Amount?.['#text'] || fee.Amount || 0),
        currency: fee.Amount?.['@CurCode'] || itemCurrency,
      });
    });

    // Add taxes
    const taxes = normalizeToArray(price.TaxSummary?.Tax);
    taxes.forEach((tax: any) => {
      breakdown.push({
        label: tax.TaxName || tax.DescText || 'Tax',
        type: 'tax',
        amount: parseFloat(tax.Amount?.['#text'] || tax.Amount || 0),
        currency: tax.Amount?.['@CurCode'] || itemCurrency,
        code: tax.TaxCode,
      });
    });
  });

  // Determine payment status - uses backendPaymentInfo if available
  const paymentStatus = extractPaymentStatus(rawData) as PaymentStatus;

  // Transform ALL payments into transactions array
  // Backend now returns payments[] array with all PaymentProcessingSummary elements
  const paymentsArray = normalizeToArray(rawData?.payments);
  const transactions: PaymentTransactionData[] = paymentsArray.map((payment: any) => {
    let paymentMethod: PaymentMethod | undefined;
    if (payment?.method) {
      paymentMethod = {
        type: payment.method.type || 'CC',
        cardBrand: payment.method.cardBrand,
        cardLastFour: payment.method.maskedCardNumber?.slice(-4),
      };
    }
    return {
      transactionId: payment?.paymentId,
      status: (payment?.status || 'UNKNOWN') as PaymentStatus,
      amount: {
        value: payment?.amount?.value || 0,
        currency: payment?.amount?.currency || currency,
      },
      // Include surcharge amount separately (CC fees)
      surchargeAmount: payment?.surchargeAmount?.value ? {
        value: payment.surchargeAmount.value,
        currency: payment.surchargeAmount.currency || currency,
      } : undefined,
      method: paymentMethod,
    };
  });

  // Calculate total amount paid from ALL successful payments
  let amountPaid: { value: number; currency: string } | undefined;
  if (transactions.length > 0) {
    // Sum all successful payment amounts
    const totalPaid = transactions
      .filter(tx => tx.status === 'SUCCESSFUL')
      .reduce((sum, tx) => sum + tx.amount.value, 0);
    amountPaid = { value: totalPaid, currency };
  } else if (backendPaymentInfo?.amount?.value !== undefined) {
    // Fallback to single payment info
    amountPaid = {
      value: backendPaymentInfo.amount.value,
      currency: backendPaymentInfo.amount.currency || currency,
    };
  } else if (legacyPaymentInfo?.Amount) {
    amountPaid = {
      value: parseFloat(legacyPaymentInfo.Amount['#text'] || legacyPaymentInfo.Amount || 0),
      currency,
    };
  } else if (paymentStatus === 'SUCCESSFUL') {
    // If payment is successful but no amount info, assume full payment
    amountPaid = { value: totalValue, currency };
  } else if (paymentStatus === 'PENDING') {
    amountPaid = { value: 0, currency };
  }

  // Calculate amount due for hold bookings
  const amountDue = paymentStatus === 'PENDING' ? { value: totalValue, currency } : undefined;

  // Get payment method from first payment (for header display)
  let method: PaymentMethod | undefined;
  if (transactions.length > 0 && transactions[0].method) {
    method = transactions[0].method;
  } else if (backendPaymentInfo?.method) {
    method = {
      type: backendPaymentInfo.method.type || 'CC',
      cardBrand: backendPaymentInfo.method.cardBrand,
      cardLastFour: backendPaymentInfo.method.maskedCardNumber?.slice(-4),
    };
  } else if (legacyPaymentInfo?.PaymentMethod) {
    method = {
      type: legacyPaymentInfo.PaymentMethod.PaymentTypeCode || 'CC',
      cardBrand: legacyPaymentInfo.PaymentMethod.PaymentCard?.CardBrandCode,
      cardLastFour: legacyPaymentInfo.PaymentMethod.PaymentCard?.CardNumber?.slice(-4),
    };
  }

  return {
    status: paymentStatus || 'UNKNOWN',
    method,
    totalAmount: { value: totalValue, currency },
    amountPaid,
    amountDue,
    breakdown: breakdown.length > 0 ? breakdown : undefined,
    transactions: transactions.length > 0 ? transactions : undefined,
  };
}

// ----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------------------------------

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    AUD: 'A$', USD: '$', EUR: '€', GBP: '£', NZD: 'NZ$', SGD: 'S$', JPY: '¥',
  };
  return symbols[currency] || currency + ' ';
}

// Combine all transformers
export function transformBookingData(rawData: any) {
  return {
    status: transformBookingStatus(rawData),
    journeys: transformFlightJourneys(rawData),
    passengers: transformPassengers(rawData),
    payment: transformPaymentData(rawData),
    // Backend returns orderId directly on data object
    pnr: rawData?.orderId ||  // Direct from backend
         rawData?.order?.orderId ||
         rawData?.Response?.Order?.OrderID ||
         rawData?.Order?.OrderID || '',
    contactInfo: extractContactInfo(rawData),
  };
}

function extractContactInfo(rawData: any) {
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const contactList = normalizeToArray(dataLists?.ContactInfoList?.ContactInfo);
  const contact = contactList[0];

  if (!contact) return undefined;

  return {
    email: contact.EmailAddress?.EmailAddressText,
    phone: contact.Phone?.PhoneNumber,
    address: contact.PostalAddress ? {
      street: contact.PostalAddress.StreetText,
      city: contact.PostalAddress.CityName,
      postalCode: contact.PostalAddress.PostalCode,
      country: contact.PostalAddress.CountryCode,
    } : undefined,
  };
}

// ----------------------------------------------------------------------------
// SERVICES DATA TRANSFORMER (for BookingServicesCard)
// ----------------------------------------------------------------------------

export interface ServiceItemData {
  orderItemId: string;
  serviceDefinitionRefId?: string;
  serviceName?: string;
  serviceCode?: string;
  serviceType: 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'OTHER';
  paxRefIds: string[];
  segmentRefIds: string[];
  quantity?: number;
  price?: { value: number; currency: string };
  seatAssignment?: {
    paxRefId: string;
    segmentRefId: string;
    row: string;
    column: string;
    seatCharacteristics?: string[];
  };
}

export interface PassengerInfoData {
  paxId: string;
  name: string;
  ptc: string;
  title?: string;
  givenName?: string;
  surname?: string;
  birthdate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  identityDoc?: {
    type: 'PP' | 'NI' | 'DL';
    number: string;
    expiryDate: string;
    issuingCountry?: string;
    nationality?: string;
  };
  loyalty?: {
    programOwner: string;
    accountNumber: string;
    tierLevel?: string;
  };
}

export interface SegmentInfoData {
  segmentId: string;
  origin: string;
  destination: string;
  flightNumber: string;
  carrierCode: string;
  departureDateTime: string;
  arrivalDateTime?: string;
  duration?: string;
  cabinCode?: string;
}

export interface JourneyInfoData {
  journeyId: string;
  direction: 'outbound' | 'return' | 'multi';
  origin: string;
  destination: string;
  segmentIds: string[];
}

export interface ServicesDisplayData {
  services: ServiceItemData[];
  passengers: PassengerInfoData[];
  segments: SegmentInfoData[];
  journeys: JourneyInfoData[];
}

/**
 * Transform raw booking data for BookingServicesCard component
 * Extracts services, seats, bundles, meals, SSRs with passenger/segment associations
 */
export function transformServicesData(rawData: any): ServicesDisplayData | null {
  if (!rawData) return null;

  // Use backend-parsed data if available (serviceItems, serviceDefinitions, etc.)
  // Otherwise fallback to parsing from DataLists
  const services = transformServiceItems(rawData);
  const passengers = transformPassengersForServices(rawData);
  const segments = transformSegmentsForServices(rawData);
  const journeys = transformJourneysForServices(rawData);

  // If no meaningful data, return null
  if (journeys.length === 0 && segments.length === 0) {
    return null;
  }

  return {
    services,
    passengers,
    segments,
    journeys,
  };
}

function transformServiceItems(rawData: any): ServiceItemData[] {
  const services: ServiceItemData[] = [];

  // Check for backend-parsed serviceItems first
  const backendServiceItems = normalizeToArray(rawData?.serviceItems);
  if (backendServiceItems.length > 0) {
    for (const item of backendServiceItems) {
      services.push({
        orderItemId: item.orderItemId || '',
        serviceDefinitionRefId: item.serviceDefinitionRefId,
        serviceName: item.serviceName,
        serviceCode: item.serviceCode,
        serviceType: item.serviceType || 'OTHER',
        paxRefIds: normalizeToArray(item.paxRefIds),
        segmentRefIds: normalizeToArray(item.segmentRefIds),
        quantity: item.quantity,
        price: item.price,
        seatAssignment: item.seatAssignment,
      });
    }
    return services;
  }

  // Fallback: Parse from raw DataLists and Order
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const serviceDefinitions = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);
  const seatProfiles = normalizeToArray(dataLists?.SeatProfileList?.SeatProfile);

  // Build service definition lookup
  const serviceDefMap = new Map<string, any>();
  for (const def of serviceDefinitions) {
    const id = def.ServiceDefinitionID || '';
    serviceDefMap.set(id, {
      serviceCode: def.ServiceCode || '',
      serviceName: def.Name || '',
      description: def.Desc?.[0]?.DescText || '',
      serviceType: determineServiceTypeFromDef(def),
    });
  }

  // Parse Order/OrderItem/Service elements
  const orderItems = normalizeToArray(
    rawData?.Order?.OrderItem ||
    rawData?.Response?.Order?.OrderItem ||
    rawData?.orderItems
  );

  for (const item of orderItems) {
    const itemServices = normalizeToArray(item.Service);
    const orderItemId = item.OrderItemID || '';

    for (const svc of itemServices) {
      const serviceDefRefId = svc.ServiceDefinitionRefID;
      const serviceDef = serviceDefRefId ? serviceDefMap.get(serviceDefRefId) : null;

      // Skip flight services (no ServiceDefinitionRefID usually means flight)
      const serviceId = svc.ServiceID || '';
      if (serviceId.includes('-FLT')) continue;

      // Get segment refs
      const segmentRefIds: string[] = [];
      const orderServiceAssoc = svc.OrderServiceAssociation;
      if (orderServiceAssoc) {
        const paxSegmentRefs = normalizeToArray(orderServiceAssoc.PaxSegmentRef);
        for (const ref of paxSegmentRefs) {
          const refId = ref.PaxSegmentRefID;
          if (refId) segmentRefIds.push(refId);
        }
      }

      // Get pax refs
      const paxRefIds = normalizeToArray(svc.PaxRefID);

      // Check for seat assignment in service ID pattern
      let seatAssignment: ServiceItemData['seatAssignment'] | undefined;
      // Pattern: s-AVVSYD-JQ612-A438248714-2D-2D (seat row/col at end)
      const seatMatch = serviceId.match(/-(\d+)([A-Z])-\d+[A-Z]$/);
      if (seatMatch) {
        seatAssignment = {
          paxRefId: paxRefIds[0] || '',
          segmentRefId: segmentRefIds[0] || '',
          row: seatMatch[1],
          column: seatMatch[2],
        };
      }

      services.push({
        orderItemId,
        serviceDefinitionRefId: serviceDefRefId,
        serviceName: serviceDef?.serviceName,
        serviceCode: serviceDef?.serviceCode,
        serviceType: seatAssignment ? 'SEAT' : (serviceDef?.serviceType || 'OTHER'),
        paxRefIds,
        segmentRefIds,
        price: undefined, // Price is at OrderItem level, not Service
        seatAssignment,
      });
    }
  }

  // Also parse seat profiles for seat assignments
  for (const profile of seatProfiles) {
    const profileId = profile.SeatProfileID || '';
    // Pattern: s-AVVSYD-JQ612-A438248714-2D-2D
    const parts = profileId.split('-');
    if (parts.length >= 6) {
      const route = parts[1]; // AVVSYD
      const origin = route.substring(0, 3);
      const dest = route.substring(3);
      const flightNum = parts[2]; // JQ612
      const paxId = parts[3]; // A438248714
      const seatCode = parts[4]; // 2D
      const row = seatCode.replace(/[A-Z]/g, '');
      const column = seatCode.replace(/\d/g, '');

      // Find corresponding segment
      const segments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);
      const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);

      let segmentRefId = '';
      for (const seg of segments) {
        const mktRef = seg.DatedMarketingSegmentRefId;
        const mktSeg = marketingSegments.find((ms: any) => ms.DatedMarketingSegmentId === mktRef);
        if (mktSeg) {
          const depCode = mktSeg.Dep?.IATA_LocationCode;
          const arrCode = mktSeg.Arrival?.IATA_LocationCode;
          const carrierFlight = `${mktSeg.CarrierDesigCode}${mktSeg.MarketingCarrierFlightNumberText}`;
          if (depCode === origin && arrCode === dest && carrierFlight === flightNum) {
            segmentRefId = seg.PaxSegmentID || '';
            break;
          }
        }
      }

      // Only add if we don't already have this seat from service items
      const exists = services.some(s =>
        s.seatAssignment?.paxRefId === paxId &&
        s.seatAssignment?.segmentRefId === segmentRefId
      );

      if (!exists && segmentRefId) {
        services.push({
          orderItemId: profileId,
          serviceType: 'SEAT',
          paxRefIds: [paxId],
          segmentRefIds: [segmentRefId],
          seatAssignment: {
            paxRefId: paxId,
            segmentRefId,
            row,
            column,
          },
        });
      }
    }
  }

  return services;
}

function determineServiceTypeFromDef(def: any): ServiceItemData['serviceType'] {
  const code = (def.ServiceCode || '').toUpperCase();
  const name = (def.Name || '').toUpperCase();
  const rfic = (def.RFIC || '').toUpperCase();

  // RFIC codes: C=Baggage, G=Meal, A=Air Transportation, F=SSR
  if (rfic === 'C') return 'BAGGAGE';
  if (rfic === 'G') return 'MEAL';
  if (rfic === 'F') return 'SSR';

  // Common SSR codes (IATA standard)
  const ssrCodes = [
    'WCHR', 'WCHS', 'WCHC', 'WCBD', 'WCBW', 'WCMP', 'WCOB', // Wheelchair
    'BLND', 'DEAF', 'DPNA', 'MAAS', 'MEDA', // Disability/Medical
    'UMNR', 'AVIH', 'PETC', 'SPEQ', // Unaccompanied minor, pets, sports equipment
    'LANG', 'OXYG', 'STCR', 'EXST', // Language, oxygen, stretcher, extra seat
    'NSST', 'NSSA', 'NSSB', 'NSSW', // No smoking seats
    'CBBG', 'BIKE', 'BULK', 'FRAG', // Special baggage
    'INFT', 'CHLD', // Infant, child
    'VGML', 'VLML', 'AVML', 'HNML', 'KSML', 'MOML', 'DBML', 'FPML', 'GFML', 'LFML', 'NLML', 'SFML', // Special meals (also check MEAL)
    'SPML', 'BBML', 'BLML', 'CHML', 'PRML', // More special meals
  ];
  if (ssrCodes.includes(code)) return 'SSR';

  // Code-based detection
  if (code.includes('BAG') || code.startsWith('BG') || code.includes('0GO')) return 'BAGGAGE';
  if (code.includes('SEAT') || code.includes('ST') || code === 'UPFX' || code === 'FXS1') return 'SEAT';
  if (code.includes('MEAL') || code.startsWith('ML')) return 'MEAL';
  if (code.includes('BNDL') || code === 'P200' || code === 'STPL') return 'BUNDLE';
  if (code.includes('SSR') || code.startsWith('WCH') || code.startsWith('PET')) return 'SSR';

  // Name-based detection
  if (name.includes('BAGGAGE') || name.includes('KG')) return 'BAGGAGE';
  if (name.includes('SEAT') || name.includes('UPFRONT') || name.includes('LEGROOM')) return 'SEAT';
  if (name.includes('MEAL') || name.includes('FOOD')) return 'MEAL';
  if (name.includes('BUNDLE') || name.includes('STARTER') || name.includes('PLUS') || name.includes('MAX')) return 'BUNDLE';
  if (name.includes('WHEELCHAIR') || name.includes('ASSISTANCE') || name.includes('SPECIAL') ||
      name.includes('PET') || name.includes('UNACCOMPANIED') || name.includes('MEDICAL')) return 'SSR';

  return 'OTHER';
}

function transformPassengersForServices(rawData: any): PassengerInfoData[] {
  const passengers: PassengerInfoData[] = [];

  // Check for backend-parsed passengers first
  const backendPassengers = normalizeToArray(rawData?.passengers);

  // Also check DataLists
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const paxList = normalizeToArray(dataLists?.PaxList?.Pax);

  const paxSource = backendPassengers.length > 0 ? backendPassengers : paxList;

  for (const pax of paxSource) {
    const individual = pax.Individual || {};
    const identityDoc = pax.IdentityDoc || pax.identityDoc;
    const loyalty = pax.LoyaltyProgramAccount || pax.loyalty;

    const paxId = pax.PaxID || pax.paxId || '';
    const givenName = individual.GivenName || pax.givenName || '';
    const surname = individual.Surname || pax.surname || '';

    passengers.push({
      paxId,
      name: `${givenName} ${surname}`.trim(),
      ptc: pax.PTC || pax.ptc || 'ADT',
      title: pax.Title || individual.Title || pax.title,
      givenName,
      surname,
      birthdate: individual.Birthdate || pax.birthdate,
      gender: individual.GenderCode || pax.gender,
      email: pax.ContactInfo?.EmailAddress?.EmailAddressText || pax.email,
      phone: pax.ContactInfo?.Phone?.PhoneNumber || pax.phone,
      identityDoc: identityDoc ? {
        type: (identityDoc.IdentityDocTypeCode === 'PT' ? 'PP' : identityDoc.IdentityDocTypeCode || identityDoc.type || 'PP') as 'PP' | 'NI' | 'DL',
        number: identityDoc.IdentityDocID || identityDoc.number || '',
        expiryDate: identityDoc.ExpiryDate || identityDoc.expiryDate || '',
        issuingCountry: identityDoc.IssuingCountryCode || identityDoc.issuingCountry,
        nationality: identityDoc.CitizenshipCountryCode || identityDoc.nationality,
      } : undefined,
      loyalty: loyalty ? {
        programOwner: loyalty.LoyaltyProgram?.Carrier?.AirlineDesigCode || loyalty.programOwner || '',
        accountNumber: loyalty.AccountNumber || loyalty.accountNumber || '',
        tierLevel: loyalty.TierLevel || loyalty.tierLevel,
      } : undefined,
    });
  }

  return passengers;
}

function transformSegmentsForServices(rawData: any): SegmentInfoData[] {
  const segments: SegmentInfoData[] = [];

  // Always parse from DataLists to ensure we have PaxSegmentID as the key
  // (journeys reference PaxSegmentID, not DatedMarketingSegmentId)
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const paxSegments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);
  const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);
  const operatingSegments = normalizeToArray(dataLists?.DatedOperatingSegmentList?.DatedOperatingSegment);

  // Build marketing segment lookup by ID
  const mktSegMap = new Map<string, any>();
  for (const ms of marketingSegments) {
    mktSegMap.set(ms.DatedMarketingSegmentId, ms);
  }

  // Build operating segment lookup for duration
  const oprSegMap = new Map<string, any>();
  for (const os of operatingSegments) {
    oprSegMap.set(os.DatedOperatingSegmentId, os);
  }

  // If we have PaxSegments, use them (keyed by PaxSegmentID which journeys reference)
  if (paxSegments.length > 0) {
    for (const paxSeg of paxSegments) {
      const paxSegId = paxSeg.PaxSegmentID || '';
      const mktRef = paxSeg.DatedMarketingSegmentRefId;
      const mktSeg = mktSegMap.get(mktRef);

      if (mktSeg) {
        const oprRef = mktSeg.DatedOperatingSegmentRefId;
        const oprSeg = oprSegMap.get(oprRef);

        segments.push({
          segmentId: paxSegId, // Use PaxSegmentID - this is what journeys reference
          origin: mktSeg.Dep?.IATA_LocationCode || '',
          destination: mktSeg.Arrival?.IATA_LocationCode || '',
          flightNumber: mktSeg.MarketingCarrierFlightNumberText || '',
          carrierCode: mktSeg.CarrierDesigCode || '',
          departureDateTime: mktSeg.Dep?.AircraftScheduledDateTime || '',
          arrivalDateTime: mktSeg.Arrival?.AircraftScheduledDateTime,
          duration: oprSeg?.Duration,
          cabinCode: paxSeg.CabinTypeAssociationChoice?.SegmentCabinType?.CabinTypeCode,
        });
      }
    }
    return segments;
  }

  // Fallback: Check for backend-parsed marketingSegments
  // But we need to map them to PaxSegmentIDs
  const backendSegments = normalizeToArray(rawData?.marketingSegments);
  const backendPaxSegments = normalizeToArray(rawData?.segments);

  // If backend provides segments (from parseSegments), use those - they have PaxSegmentID
  if (backendPaxSegments.length > 0) {
    for (const seg of backendPaxSegments) {
      segments.push({
        segmentId: seg.paxSegmentId || '',
        origin: seg.origin || '',
        destination: seg.destination || '',
        flightNumber: seg.marketingCarrier?.flightNumber || '',
        carrierCode: seg.marketingCarrier?.airlineCode || '',
        departureDateTime: seg.departureDate || '',
        arrivalDateTime: seg.arrivalDate,
        duration: seg.duration,
      });
    }
    return segments;
  }

  // Last fallback: use marketingSegments directly (may not match journey refs)
  if (backendSegments.length > 0) {
    for (const seg of backendSegments) {
      segments.push({
        segmentId: seg.segmentId || '',
        origin: seg.origin || '',
        destination: seg.destination || '',
        flightNumber: seg.flightNumber || '',
        carrierCode: seg.carrierCode || '',
        departureDateTime: seg.departureDateTime || '',
        arrivalDateTime: seg.arrivalDateTime,
        duration: seg.duration,
        cabinCode: seg.cabinCode,
      });
    }
  }

  return segments;
}

function transformJourneysForServices(rawData: any): JourneyInfoData[] {
  const journeys: JourneyInfoData[] = [];

  // Check for backend-parsed journeys
  const backendJourneys = normalizeToArray(rawData?.journeys);

  // Also check DataLists
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const paxJourneys = normalizeToArray(dataLists?.PaxJourneyList?.PaxJourney);

  const journeySource = backendJourneys.length > 0 ? backendJourneys :
                        paxJourneys.length > 0 ? paxJourneys : [];

  // Get segments for origin/destination lookup
  const segments = transformSegmentsForServices(rawData);
  const segmentMap = new Map<string, SegmentInfoData>();
  for (const seg of segments) {
    segmentMap.set(seg.segmentId, seg);
  }

  for (let idx = 0; idx < journeySource.length; idx++) {
    const j = journeySource[idx];
    const journeyId = j.PaxJourneyID || j.paxJourneyId || `journey-${idx + 1}`;
    const segmentRefIds = normalizeToArray(j.PaxSegmentRefID || j.segmentRefIds);

    // Determine origin/destination from first/last segment
    const firstSegId = segmentRefIds[0];
    const lastSegId = segmentRefIds[segmentRefIds.length - 1];
    const firstSeg = segmentMap.get(firstSegId);
    const lastSeg = segmentMap.get(lastSegId);

    journeys.push({
      journeyId,
      direction: idx === 0 ? 'outbound' : idx === 1 ? 'return' : 'multi',
      origin: firstSeg?.origin || '',
      destination: lastSeg?.destination || '',
      segmentIds: segmentRefIds,
    });
  }

  return journeys;
}
