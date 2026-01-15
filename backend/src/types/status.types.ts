// ============================================================================
// BOOKING STATUS TYPES - Comprehensive Status Handling
// NDC 21.3 Payment, Order, and Delivery Status Codes with User Explanations
// ============================================================================

// ----------------------------------------------------------------------------
// PAYMENT STATUS - What happened with the payment transaction
// ----------------------------------------------------------------------------

export type PaymentStatusCode =
  | "SUCCESSFUL"    // Payment completed successfully
  | "PENDING"       // Payment is being processed
  | "FAILED"        // Payment was declined or failed
  | "CANCELLED"     // Payment was cancelled by user/system
  | "REFUNDED"      // Payment has been refunded
  | "PARTIAL"       // Partial payment received
  | "UNKNOWN";      // Status could not be determined

export interface PaymentStatusInfo {
  code: PaymentStatusCode;
  rawCode?: string;           // Original code from NDC response
  amount?: {
    value: number;
    currency: string;
  };
  refundAmount?: {
    value: number;
    currency: string;
  };
  transactionId?: string;
  paymentMethod?: string;     // CC, AGT, CA
  cardBrand?: string;         // VI, MC, AX, etc.
  cardLastFour?: string;      // Last 4 digits
  timestamp?: string;
}

// ----------------------------------------------------------------------------
// ORDER STATUS - Overall booking lifecycle state
// ----------------------------------------------------------------------------

export type OrderStatusCode =
  | "OPENED"        // Order created but not confirmed/ticketed
  | "CONFIRMED"     // Order confirmed, pending ticketing
  | "TICKETED"      // Tickets issued
  | "CLOSED"        // Order closed (cancelled or completed)
  | "CANCELLED"     // Order was cancelled
  | "REFUNDED"      // Order refunded
  | "PENDING"       // Waiting for action
  | "ON_HOLD"       // Booking on hold awaiting payment
  | "UNKNOWN";      // Status could not be determined

export interface OrderStatusInfo {
  code: OrderStatusCode;
  rawCode?: string;           // Original code from NDC response (OK, HK, TK, XX)
  creationDateTime?: string;
  paymentTimeLimit?: string;  // Deadline for hold bookings
  ticketTimeLimit?: string;   // Auto-cancel time
  isHoldBooking: boolean;
}

// ----------------------------------------------------------------------------
// DELIVERY STATUS - Ticket/Document fulfillment state
// ----------------------------------------------------------------------------

export type DeliveryStatusCode =
  | "CONFIRMED"         // Delivery confirmed, documents ready
  | "READY_TO_PROCEED"  // Ready for ticketing, awaiting final confirmation
  | "IN_PROGRESS"       // Documents being generated
  | "DELIVERED"         // Documents sent to customer
  | "FAILED"            // Delivery failed
  | "PENDING"           // Awaiting delivery
  | "UNKNOWN";          // Status could not be determined

export interface DeliveryStatusInfo {
  code: DeliveryStatusCode;
  rawCode?: string;
  eTicketNumbers?: string[];
  deliveryMethod?: string;    // EMAIL, SMS, etc.
}

// ----------------------------------------------------------------------------
// COMBINED BOOKING STATUS - Complete picture
// ----------------------------------------------------------------------------

export interface BookingStatusSummary {
  // Core statuses
  payment: PaymentStatusInfo;
  order: OrderStatusInfo;
  delivery: DeliveryStatusInfo;

  // Computed properties
  overallHealth: "success" | "warning" | "error" | "info";
  headline: string;           // Main status message
  subheadline: string;        // Secondary explanation
  actionRequired?: string;    // What user needs to do (if any)

  // Time-sensitive info
  urgentDeadline?: {
    type: "payment" | "ticketing" | "check-in";
    datetime: string;
    message: string;
  };

  // Modification eligibility
  canModify: boolean;
  canCancel: boolean;
  canAddServices: boolean;
}

// ----------------------------------------------------------------------------
// STATUS CODE MAPPINGS - NDC to Internal
// ----------------------------------------------------------------------------

export const PAYMENT_STATUS_MAP: Record<string, PaymentStatusCode> = {
  // Direct matches
  "SUCCESSFUL": "SUCCESSFUL",
  "SUCCESS": "SUCCESSFUL",
  "COMPLETED": "SUCCESSFUL",
  "CONFIRMED": "SUCCESSFUL",
  "APPROVED": "SUCCESSFUL",
  "PAID": "SUCCESSFUL",

  "PENDING": "PENDING",
  "PROCESSING": "PENDING",
  "IN_PROGRESS": "PENDING",
  "AWAITING": "PENDING",

  "FAILED": "FAILED",
  "DECLINED": "FAILED",
  "REJECTED": "FAILED",
  "ERROR": "FAILED",

  "CANCELLED": "CANCELLED",
  "VOIDED": "CANCELLED",

  "REFUNDED": "REFUNDED",
  "REFUND": "REFUNDED",

  "PARTIAL": "PARTIAL",
  "UNDERPAID": "PARTIAL",
};

export const ORDER_STATUS_MAP: Record<string, OrderStatusCode> = {
  // NDC Standard codes
  "OPENED": "OPENED",
  "OPEN": "OPENED",
  "CONFIRMED": "CONFIRMED",
  "TICKETED": "TICKETED",
  "CLOSED": "CLOSED",
  "CANCELLED": "CANCELLED",
  "REFUNDED": "REFUNDED",
  "PENDING": "PENDING",
  "ON_HOLD": "ON_HOLD",
  "HOLD": "ON_HOLD",

  // IATA PNR Status Codes
  "OK": "CONFIRMED",      // Standard confirmed
  "HK": "CONFIRMED",      // Holding confirmed
  "TK": "TICKETED",       // Ticketed
  "XX": "CANCELLED",      // Cancelled
  "HX": "CANCELLED",      // Holding cancelled
  "UC": "PENDING",        // Unable to confirm
  "UN": "PENDING",        // Unable, need waitlist
  "RR": "CONFIRMED",      // Reconfirmed
};

export const DELIVERY_STATUS_MAP: Record<string, DeliveryStatusCode> = {
  "CONFIRMED": "CONFIRMED",
  "READY TO PROCEED": "READY_TO_PROCEED",
  "READY_TO_PROCEED": "READY_TO_PROCEED",
  "RTP": "READY_TO_PROCEED",
  "IN_PROGRESS": "IN_PROGRESS",
  "PROCESSING": "IN_PROGRESS",
  "DELIVERED": "DELIVERED",
  "SENT": "DELIVERED",
  "FAILED": "FAILED",
  "ERROR": "FAILED",
  "PENDING": "PENDING",
  "AWAITING": "PENDING",
};

// ----------------------------------------------------------------------------
// STATUS EXPLANATIONS - User-friendly messages
// ----------------------------------------------------------------------------

export interface StatusExplanation {
  title: string;
  description: string;
  technicalNote: string;
  icon: "check" | "clock" | "alert" | "x" | "info" | "credit-card" | "ticket" | "plane";
  color: "green" | "yellow" | "red" | "blue" | "gray" | "orange";
}

export const PAYMENT_EXPLANATIONS: Record<PaymentStatusCode, StatusExplanation> = {
  SUCCESSFUL: {
    title: "Payment Successful",
    description: "Your payment has been processed and confirmed. The full amount has been charged to your payment method.",
    technicalNote: "Transaction completed with authorization code received from payment gateway.",
    icon: "check",
    color: "green",
  },
  PENDING: {
    title: "Payment Processing",
    description: "Your payment is currently being processed. This usually takes a few moments. Please do not refresh or close this page.",
    technicalNote: "Transaction initiated, awaiting confirmation from payment processor.",
    icon: "clock",
    color: "yellow",
  },
  FAILED: {
    title: "Payment Declined",
    description: "Unfortunately, your payment could not be processed. This may be due to insufficient funds, incorrect card details, or a temporary bank issue.",
    technicalNote: "Payment gateway returned decline response. No charge was made.",
    icon: "x",
    color: "red",
  },
  CANCELLED: {
    title: "Payment Cancelled",
    description: "The payment transaction was cancelled. No charge has been made to your account.",
    technicalNote: "Transaction voided before completion.",
    icon: "x",
    color: "gray",
  },
  REFUNDED: {
    title: "Payment Refunded",
    description: "Your payment has been refunded. The amount will be returned to your original payment method within 5-10 business days.",
    technicalNote: "Refund processed successfully. Reference number available.",
    icon: "credit-card",
    color: "blue",
  },
  PARTIAL: {
    title: "Partial Payment",
    description: "A partial payment has been received. Additional payment is required to complete your booking.",
    technicalNote: "Order is underpaid. Outstanding balance must be settled.",
    icon: "alert",
    color: "orange",
  },
  UNKNOWN: {
    title: "Payment Status Unknown",
    description: "We couldn't determine the current payment status. Please contact customer support for assistance.",
    technicalNote: "Payment status code not recognized in response.",
    icon: "info",
    color: "gray",
  },
};

export const ORDER_EXPLANATIONS: Record<OrderStatusCode, StatusExplanation> = {
  OPENED: {
    title: "Booking Created",
    description: "Your booking has been created and is awaiting confirmation. Payment may be required to proceed.",
    technicalNote: "Order initialized in airline system. Not yet confirmed.",
    icon: "info",
    color: "blue",
  },
  CONFIRMED: {
    title: "Booking Confirmed",
    description: "Great news! Your booking is confirmed. Your seats are secured and you're ready to fly.",
    technicalNote: "PNR created with status OK/HK. Segments confirmed.",
    icon: "check",
    color: "green",
  },
  TICKETED: {
    title: "Tickets Issued",
    description: "Your e-tickets have been issued. You're all set for your journey! Check your email for your itinerary.",
    technicalNote: "Electronic tickets generated. E-ticket numbers assigned.",
    icon: "ticket",
    color: "green",
  },
  CLOSED: {
    title: "Booking Closed",
    description: "This booking has been closed. This could mean the journey is complete or the booking was cancelled.",
    technicalNote: "Order lifecycle completed. No further modifications allowed.",
    icon: "info",
    color: "gray",
  },
  CANCELLED: {
    title: "Booking Cancelled",
    description: "This booking has been cancelled. If eligible, any refund will be processed according to the fare rules.",
    technicalNote: "Order cancelled. Check refund status for payment details.",
    icon: "x",
    color: "red",
  },
  REFUNDED: {
    title: "Booking Refunded",
    description: "Your booking has been cancelled and refunded. The refund will appear on your statement within 5-10 business days.",
    technicalNote: "Order cancelled with refund processed.",
    icon: "credit-card",
    color: "blue",
  },
  PENDING: {
    title: "Booking Pending",
    description: "Your booking is pending confirmation. This may require additional action or verification.",
    technicalNote: "Awaiting confirmation from airline system or payment.",
    icon: "clock",
    color: "yellow",
  },
  ON_HOLD: {
    title: "Booking On Hold",
    description: "Your booking is on hold awaiting payment. Please complete payment before the deadline to secure your seats.",
    technicalNote: "Hold booking created. Payment required before time limit.",
    icon: "clock",
    color: "orange",
  },
  UNKNOWN: {
    title: "Status Unknown",
    description: "We couldn't determine the booking status. Please contact customer support for assistance.",
    technicalNote: "Order status code not recognized.",
    icon: "info",
    color: "gray",
  },
};

export const DELIVERY_EXPLANATIONS: Record<DeliveryStatusCode, StatusExplanation> = {
  CONFIRMED: {
    title: "Documents Ready",
    description: "Your travel documents are ready. You can download your e-ticket and itinerary from your booking.",
    technicalNote: "Delivery confirmed. Documents generated and available.",
    icon: "check",
    color: "green",
  },
  READY_TO_PROCEED: {
    title: "Ready for Ticketing",
    description: "Your booking is ready for ticket issuance. Tickets will be issued shortly after payment confirmation.",
    technicalNote: "Fulfillment queue ready. Awaiting final processing trigger.",
    icon: "clock",
    color: "blue",
  },
  IN_PROGRESS: {
    title: "Generating Documents",
    description: "Your e-tickets and travel documents are being generated. This usually takes just a few moments.",
    technicalNote: "Document generation in progress.",
    icon: "clock",
    color: "yellow",
  },
  DELIVERED: {
    title: "Documents Sent",
    description: "Your travel documents have been sent to your email address. Check your inbox and spam folder.",
    technicalNote: "Delivery notification sent successfully.",
    icon: "plane",
    color: "green",
  },
  FAILED: {
    title: "Delivery Failed",
    description: "We couldn't deliver your documents. Please check your contact details or download from your booking.",
    technicalNote: "Document delivery failed. Manual retrieval required.",
    icon: "alert",
    color: "red",
  },
  PENDING: {
    title: "Awaiting Delivery",
    description: "Your documents are queued for delivery. You'll receive them shortly.",
    technicalNote: "Delivery pending. In queue for processing.",
    icon: "clock",
    color: "yellow",
  },
  UNKNOWN: {
    title: "Delivery Status Unknown",
    description: "We couldn't determine the document delivery status. Your booking is still valid.",
    technicalNote: "Delivery status not available in response.",
    icon: "info",
    color: "gray",
  },
};
