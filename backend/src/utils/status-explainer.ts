// ============================================================================
// STATUS EXPLAINER UTILITY
// Converts raw NDC status codes into comprehensive, user-friendly explanations
// ============================================================================

import {
  PaymentStatusCode,
  OrderStatusCode,
  DeliveryStatusCode,
  PaymentStatusInfo,
  OrderStatusInfo,
  DeliveryStatusInfo,
  BookingStatusSummary,
  PAYMENT_STATUS_MAP,
  ORDER_STATUS_MAP,
  DELIVERY_STATUS_MAP,
  PAYMENT_EXPLANATIONS,
  ORDER_EXPLANATIONS,
  DELIVERY_EXPLANATIONS,
} from "../types/status.types.js";

// ----------------------------------------------------------------------------
// STATUS PARSING
// ----------------------------------------------------------------------------

/**
 * Parse raw payment status code to standardized PaymentStatusCode
 */
export function parsePaymentStatus(rawCode: string | undefined): PaymentStatusCode {
  if (!rawCode) return "UNKNOWN";
  const normalized = rawCode.toUpperCase().trim();
  return PAYMENT_STATUS_MAP[normalized] || "UNKNOWN";
}

/**
 * Parse raw order status code to standardized OrderStatusCode
 */
export function parseOrderStatus(rawCode: string | undefined): OrderStatusCode {
  if (!rawCode) return "UNKNOWN";
  const normalized = rawCode.toUpperCase().trim();
  return ORDER_STATUS_MAP[normalized] || "UNKNOWN";
}

/**
 * Parse raw delivery status code to standardized DeliveryStatusCode
 */
export function parseDeliveryStatus(rawCode: string | undefined): DeliveryStatusCode {
  if (!rawCode) return "UNKNOWN";
  const normalized = rawCode.toUpperCase().trim().replace(/\s+/g, "_");
  return DELIVERY_STATUS_MAP[normalized] || DELIVERY_STATUS_MAP[rawCode.toUpperCase()] || "UNKNOWN";
}

// ----------------------------------------------------------------------------
// STATUS INFO BUILDERS
// ----------------------------------------------------------------------------

export interface RawPaymentData {
  statusCode?: string;
  amount?: { value: number; currency: string };
  refundAmount?: { value: number; currency: string };
  transactionId?: string;
  paymentMethod?: string;
  cardBrand?: string;
  cardLastFour?: string;
  timestamp?: string;
}

export function buildPaymentStatusInfo(data: RawPaymentData): PaymentStatusInfo {
  return {
    code: parsePaymentStatus(data.statusCode),
    rawCode: data.statusCode,
    amount: data.amount,
    refundAmount: data.refundAmount,
    transactionId: data.transactionId,
    paymentMethod: data.paymentMethod,
    cardBrand: data.cardBrand,
    cardLastFour: data.cardLastFour,
    timestamp: data.timestamp,
  };
}

export interface RawOrderData {
  statusCode?: string;
  creationDateTime?: string;
  paymentTimeLimit?: string;
  ticketTimeLimit?: string;
}

export function buildOrderStatusInfo(data: RawOrderData): OrderStatusInfo {
  const code = parseOrderStatus(data.statusCode);
  const isHoldBooking =
    code === "ON_HOLD" ||
    code === "OPENED" ||
    (code === "PENDING" && !!data.paymentTimeLimit);

  return {
    code,
    rawCode: data.statusCode,
    creationDateTime: data.creationDateTime,
    paymentTimeLimit: data.paymentTimeLimit,
    ticketTimeLimit: data.ticketTimeLimit,
    isHoldBooking,
  };
}

export interface RawDeliveryData {
  statusCode?: string;
  eTicketNumbers?: string[];
  deliveryMethod?: string;
}

export function buildDeliveryStatusInfo(data: RawDeliveryData): DeliveryStatusInfo {
  return {
    code: parseDeliveryStatus(data.statusCode),
    rawCode: data.statusCode,
    eTicketNumbers: data.eTicketNumbers,
    deliveryMethod: data.deliveryMethod,
  };
}

// ----------------------------------------------------------------------------
// COMPREHENSIVE STATUS SUMMARY
// ----------------------------------------------------------------------------

export interface BuildStatusSummaryInput {
  payment: RawPaymentData;
  order: RawOrderData;
  delivery: RawDeliveryData;
}

export function buildBookingStatusSummary(input: BuildStatusSummaryInput): BookingStatusSummary {
  const payment = buildPaymentStatusInfo(input.payment);
  const order = buildOrderStatusInfo(input.order);
  const delivery = buildDeliveryStatusInfo(input.delivery);

  // Determine overall health
  const overallHealth = determineOverallHealth(payment, order, delivery);

  // Generate headline and subheadline
  const { headline, subheadline } = generateHeadlines(payment, order, delivery);

  // Check for action required
  const actionRequired = determineActionRequired(payment, order, delivery);

  // Check for urgent deadlines
  const urgentDeadline = checkUrgentDeadlines(order);

  // Determine modification eligibility
  const { canModify, canCancel, canAddServices } = determineEligibility(order, payment);

  return {
    payment,
    order,
    delivery,
    overallHealth,
    headline,
    subheadline,
    actionRequired,
    urgentDeadline,
    canModify,
    canCancel,
    canAddServices,
  };
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

function determineOverallHealth(
  payment: PaymentStatusInfo,
  order: OrderStatusInfo,
  delivery: DeliveryStatusInfo
): "success" | "warning" | "error" | "info" {
  // Error conditions
  if (payment.code === "FAILED" || order.code === "CANCELLED") {
    return "error";
  }

  // Warning conditions
  if (
    payment.code === "PENDING" ||
    payment.code === "PARTIAL" ||
    order.code === "ON_HOLD" ||
    order.code === "PENDING" ||
    delivery.code === "FAILED"
  ) {
    return "warning";
  }

  // Success conditions
  if (
    payment.code === "SUCCESSFUL" &&
    (order.code === "CONFIRMED" || order.code === "TICKETED") &&
    (delivery.code === "CONFIRMED" || delivery.code === "DELIVERED")
  ) {
    return "success";
  }

  // Info for everything else
  return "info";
}

function generateHeadlines(
  payment: PaymentStatusInfo,
  order: OrderStatusInfo,
  delivery: DeliveryStatusInfo
): { headline: string; subheadline: string } {
  // Payment failed - most critical
  if (payment.code === "FAILED") {
    return {
      headline: "Payment Unsuccessful",
      subheadline: "Your payment could not be processed. Please try again with a different payment method.",
    };
  }

  // Order cancelled
  if (order.code === "CANCELLED") {
    return {
      headline: "Booking Cancelled",
      subheadline: payment.code === "REFUNDED"
        ? "Your booking has been cancelled and refunded."
        : "This booking has been cancelled.",
    };
  }

  // Hold booking awaiting payment
  if (order.isHoldBooking && payment.code !== "SUCCESSFUL") {
    const deadline = order.paymentTimeLimit
      ? formatDeadline(order.paymentTimeLimit)
      : "soon";
    return {
      headline: "Payment Required",
      subheadline: `Complete payment by ${deadline} to secure your booking.`,
    };
  }

  // Partial payment
  if (payment.code === "PARTIAL") {
    return {
      headline: "Partial Payment Received",
      subheadline: "Additional payment is required to complete your booking.",
    };
  }

  // Ticketed - best case
  if (order.code === "TICKETED") {
    return {
      headline: "You're All Set!",
      subheadline: delivery.eTicketNumbers?.length
        ? `E-ticket${delivery.eTicketNumbers.length > 1 ? 's' : ''} issued. Check your email for details.`
        : "Your tickets have been issued. You're ready to fly!",
    };
  }

  // Confirmed but not yet ticketed
  if (order.code === "CONFIRMED" && payment.code === "SUCCESSFUL") {
    if (delivery.code === "READY_TO_PROCEED") {
      return {
        headline: "Booking Confirmed",
        subheadline: "Your booking is confirmed and tickets will be issued shortly.",
      };
    }
    return {
      headline: "Booking Confirmed",
      subheadline: "Your seats are secured. Have a great flight!",
    };
  }

  // Payment pending
  if (payment.code === "PENDING") {
    return {
      headline: "Processing Payment",
      subheadline: "Please wait while we confirm your payment...",
    };
  }

  // Default
  return {
    headline: ORDER_EXPLANATIONS[order.code].title,
    subheadline: ORDER_EXPLANATIONS[order.code].description,
  };
}

function determineActionRequired(
  payment: PaymentStatusInfo,
  order: OrderStatusInfo,
  _delivery: DeliveryStatusInfo
): string | undefined {
  if (payment.code === "FAILED") {
    return "Please retry payment with a different card or payment method.";
  }

  if (payment.code === "PARTIAL") {
    return "Please complete the remaining payment to confirm your booking.";
  }

  if (order.isHoldBooking && payment.code !== "SUCCESSFUL") {
    return "Complete payment before the deadline to avoid automatic cancellation.";
  }

  return undefined;
}

function checkUrgentDeadlines(order: OrderStatusInfo): BookingStatusSummary["urgentDeadline"] {
  if (!order.paymentTimeLimit) return undefined;

  const deadline = new Date(order.paymentTimeLimit);
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    return {
      type: "payment",
      datetime: order.paymentTimeLimit,
      message: "Payment deadline has passed!",
    };
  }

  if (hoursRemaining <= 24) {
    const hours = Math.floor(hoursRemaining);
    const mins = Math.floor((hoursRemaining - hours) * 60);
    return {
      type: "payment",
      datetime: order.paymentTimeLimit,
      message: hours > 0
        ? `Payment due in ${hours}h ${mins}m`
        : `Payment due in ${mins} minutes!`,
    };
  }

  return undefined;
}

function determineEligibility(
  order: OrderStatusInfo,
  payment: PaymentStatusInfo
): { canModify: boolean; canCancel: boolean; canAddServices: boolean } {
  const isActive =
    order.code === "CONFIRMED" ||
    order.code === "TICKETED" ||
    order.code === "ON_HOLD" ||
    order.code === "OPENED";

  const isPaid = payment.code === "SUCCESSFUL";

  return {
    canModify: isActive && isPaid,
    canCancel: isActive,
    canAddServices: isActive && isPaid,
  };
}

function formatDeadline(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours < 0) return "expired";
    if (diffHours < 1) return `${diffMins} minutes`;
    if (diffHours < 24) return `${diffHours} hours`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

// ----------------------------------------------------------------------------
// GET EXPLANATION FUNCTIONS
// ----------------------------------------------------------------------------

export function getPaymentExplanation(code: PaymentStatusCode) {
  return PAYMENT_EXPLANATIONS[code];
}

export function getOrderExplanation(code: OrderStatusCode) {
  return ORDER_EXPLANATIONS[code];
}

export function getDeliveryExplanation(code: DeliveryStatusCode) {
  return DELIVERY_EXPLANATIONS[code];
}

// ----------------------------------------------------------------------------
// FORMATTED OUTPUT FOR LOGGING/DISPLAY
// ----------------------------------------------------------------------------

export function formatStatusForLog(summary: BookingStatusSummary): string {
  const lines = [
    `========== BOOKING STATUS SUMMARY ==========`,
    ``,
    `OVERALL: ${summary.overallHealth.toUpperCase()}`,
    `${summary.headline}`,
    `${summary.subheadline}`,
    ``,
    `--- Payment ---`,
    `Status: ${summary.payment.code} (raw: ${summary.payment.rawCode || 'N/A'})`,
    `Amount: ${summary.payment.amount ? `${summary.payment.amount.currency} ${summary.payment.amount.value}` : 'N/A'}`,
    `Method: ${summary.payment.paymentMethod || 'N/A'}`,
    ``,
    `--- Order ---`,
    `Status: ${summary.order.code} (raw: ${summary.order.rawCode || 'N/A'})`,
    `Hold Booking: ${summary.order.isHoldBooking ? 'Yes' : 'No'}`,
    `Payment Deadline: ${summary.order.paymentTimeLimit || 'N/A'}`,
    ``,
    `--- Delivery ---`,
    `Status: ${summary.delivery.code} (raw: ${summary.delivery.rawCode || 'N/A'})`,
    `E-Tickets: ${summary.delivery.eTicketNumbers?.join(', ') || 'N/A'}`,
    ``,
    `--- Eligibility ---`,
    `Can Modify: ${summary.canModify}`,
    `Can Cancel: ${summary.canCancel}`,
    `Can Add Services: ${summary.canAddServices}`,
  ];

  if (summary.actionRequired) {
    lines.push(``, `ACTION REQUIRED: ${summary.actionRequired}`);
  }

  if (summary.urgentDeadline) {
    lines.push(``, `URGENT: ${summary.urgentDeadline.message}`);
  }

  lines.push(``, `=============================================`);

  return lines.join('\n');
}

// Export singleton
export const statusExplainer = {
  parsePaymentStatus,
  parseOrderStatus,
  parseDeliveryStatus,
  buildPaymentStatusInfo,
  buildOrderStatusInfo,
  buildDeliveryStatusInfo,
  buildBookingStatusSummary,
  getPaymentExplanation,
  getOrderExplanation,
  getDeliveryExplanation,
  formatStatusForLog,
};
