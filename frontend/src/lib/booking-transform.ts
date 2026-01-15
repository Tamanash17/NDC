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
}

export function transformBookingStatus(rawData: any): BookingStatusData {
  // Extract raw status codes - check multiple possible paths
  // Backend parsed format uses order.status (not StatusCode)
  const orderStatusRaw = rawData?.order?.status ||
                         rawData?.Response?.Order?.StatusCode ||
                         rawData?.Order?.StatusCode ||
                         rawData?.order?.StatusCode || 'OK';
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
  };
}

function extractPaymentStatus(data: any): string {
  // Check for warnings first - "Order is underpaid" is critical
  // Backend parsed format uses lowercase 'warnings' array with { code, message }
  const warnings = normalizeToArray(data?.warnings || data?.Response?.Warning || data?.Warning);
  const hasUnderpaidWarning = warnings.some((w: any) =>
    w?.message?.toLowerCase().includes('underpaid') ||
    w?.DescText?.toLowerCase().includes('underpaid') ||
    w?.code === 'OF2003' ||
    w?.TypeCode === 'OF2003'
  );

  // Get order status - OPENED means hold booking (not paid)
  // Backend parsed format uses order.status (not StatusCode)
  const orderStatus = data?.order?.status ||
                      data?.Response?.Order?.StatusCode ||
                      data?.Order?.StatusCode ||
                      data?.order?.StatusCode || '';

  // OPENED status = hold booking, payment required
  if (orderStatus === 'OPENED' || hasUnderpaidWarning) {
    return 'PENDING';
  }

  // Check for explicit payment info
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
  const timeLimit = orderItems[0]?.PaymentTimeLimitDateTime;
  if (timeLimit) {
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

  // Warning states - OPENED = hold booking, PENDING = awaiting payment
  if (payment === 'PENDING' || payment === 'PARTIAL' || order === 'OPENED') return 'warning';

  // Success states
  if ((payment === 'SUCCESSFUL' || payment === 'UNKNOWN') &&
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

  // OPENED = Hold booking, PENDING payment
  if (order === 'OPENED' || payment === 'PENDING') {
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
  const labels: Record<string, Record<string, string>> = {
    payment: {
      SUCCESSFUL: 'Paid',
      SUCCESS: 'Paid',
      COMPLETED: 'Paid',
      PENDING: 'Awaiting Payment',
      FAILED: 'Failed',
      REFUNDED: 'Refunded',
      PARTIAL: 'Partial',
      UNKNOWN: 'Unknown',
    },
    order: {
      OK: 'Confirmed',
      HK: 'Confirmed',
      CONFIRMED: 'Confirmed',
      TICKETED: 'Ticketed',
      TK: 'Ticketed',
      CANCELLED: 'Cancelled',
      XX: 'Cancelled',
      OPENED: 'On Hold',
      PENDING: 'Pending',
    },
    delivery: {
      CONFIRMED: 'Ready',
      READY_TO_PROCEED: 'Processing',
      RTP: 'Processing',
      DELIVERED: 'Sent',
      PENDING: 'Pending',
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

export interface PaymentData {
  status: PaymentStatus;
  method?: PaymentMethod;
  totalAmount: { value: number; currency: string };
  amountPaid?: { value: number; currency: string };
  amountDue?: { value: number; currency: string };
  breakdown?: PriceBreakdownItem[];
}

export function transformPaymentData(rawData: any): PaymentData {
  const order = rawData?.order || rawData?.Response?.Order || rawData?.Order;
  const orderItems = normalizeToArray(order?.orderItems || order?.OrderItem);
  const paymentInfo = rawData?.Response?.PaymentInfo || rawData?.PaymentInfo;

  // Get total from order.totalPrice (backend parsed format) or Order.TotalPrice
  const orderTotal = order?.totalPrice || order?.TotalPrice?.TotalAmount;
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

  // Determine payment status
  const paymentStatus = extractPaymentStatus(rawData) as PaymentStatus;

  // Calculate amount due for hold bookings
  const amountDue = paymentStatus === 'PENDING' ? { value: totalValue, currency } : undefined;

  return {
    status: paymentStatus || 'UNKNOWN',
    method: paymentInfo?.PaymentMethod ? {
      type: paymentInfo.PaymentMethod.PaymentTypeCode || 'CC',
      cardBrand: paymentInfo.PaymentMethod.PaymentCard?.CardBrandCode,
      cardLastFour: paymentInfo.PaymentMethod.PaymentCard?.CardNumber?.slice(-4),
    } : undefined,
    totalAmount: { value: totalValue, currency },
    amountPaid: paymentInfo?.Amount ? {
      value: parseFloat(paymentInfo.Amount['#text'] || paymentInfo.Amount || 0),
      currency,
    } : (paymentStatus === 'PENDING' ? { value: 0, currency } : undefined),
    amountDue,
    breakdown: breakdown.length > 0 ? breakdown : undefined,
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
  // Debug logging to understand data structure
  console.log('[BookingTransform] Raw data keys:', Object.keys(rawData || {}));
  console.log('[BookingTransform] order:', rawData?.order);
  console.log('[BookingTransform] order.status:', rawData?.order?.status);
  console.log('[BookingTransform] order.totalPrice:', rawData?.order?.totalPrice);
  console.log('[BookingTransform] warnings:', rawData?.warnings);

  return {
    status: transformBookingStatus(rawData),
    journeys: transformFlightJourneys(rawData),
    passengers: transformPassengers(rawData),
    payment: transformPaymentData(rawData),
    // Backend parsed format uses order.orderId (lowercase)
    pnr: rawData?.order?.orderId ||
         rawData?.Response?.Order?.OrderID ||
         rawData?.Order?.OrderID ||
         rawData?.order?.OrderID ||
         rawData?.orderId || '',
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
