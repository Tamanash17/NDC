import type { NDCOperation } from './ndc.types';

// ============================================================================
// STEP DEFINITION
// ============================================================================

export interface StepDefinition {
  id: string;
  operation: NDCOperation | 'Passengers' | 'Payment' | 'Confirmation';
  label: string;
  description: string;
  component: string;
  
  // Configuration
  config?: StepConfig;
  
  // Dependencies
  requires?: string[];
  provides?: string[];
  
  // Conditional execution
  condition?: StepCondition;
  
  // Pricing display
  showsPricing?: boolean;
  pricingSource?: 'shopping' | 'servicelist' | 'offerprice' | 'quote';
  
  // UI hints
  optional?: boolean;
  canSkip?: boolean;
}

export interface StepConfig {
  // AirShopping
  includeBundles?: boolean;
  bundleSource?: 'airshopping' | 'servicelist';
  detectPaymentFees?: boolean;
  
  // ServiceList
  serviceTypes?: ('baggage' | 'meals' | 'seats' | 'bundles' | 'other')[];
  
  // SeatAvailability
  seatSelectionMode?: 'manual' | 'auto' | 'skip';
  
  // OrderCreate
  orderState?: 'hold' | 'confirmed';
  
  // Generic
  [key: string]: unknown;
}

export interface StepCondition {
  field: string;
  operator: 'exists' | 'equals' | 'notEquals' | 'greaterThan';
  value?: unknown;
}

// ============================================================================
// SCENARIO DEFINITION
// ============================================================================

export interface ScenarioDefinition {
  // Identity
  id: string;
  name: string;
  description: string;
  
  // Categorization
  category: 'prime' | 'servicing';
  subcategory: string;
  tags: string[];
  
  // Workflow
  steps: StepDefinition[];
  
  // Pricing checkpoints
  pricingCheckpoints?: PricingCheckpoint[];
  
  // UI Configuration
  ui?: ScenarioUI;
  
  // Availability
  enabled?: boolean;
}

export interface PricingCheckpoint {
  stepId: string;
  label: string;
  compareWith?: string;
}

export interface ScenarioUI {
  icon?: string;
  color?: string;
  badge?: string;
  estimatedDuration?: string;
  complexity?: 'simple' | 'standard' | 'complex';
}

// ============================================================================
// WORKFLOW STATE
// ============================================================================

export interface WorkflowState {
  scenarioId: string;
  currentStepIndex: number;
  completedSteps: string[];
  stepResults: Record<string, StepResult>;
  context: WorkflowContext;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  error?: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: string;
  duration?: number;
}

export interface WorkflowContext {
  // Session
  bookingType: 'DIRECT' | 'BOB';
  operationType: 'PRIME' | 'SERVICING';
  
  // Distribution chain
  myOrganization: { orgCode: string; orgName: string };
  sellerOrganization?: { orgCode: string; orgName: string };
  
  // Search criteria
  searchCriteria?: SearchCriteria;
  
  // Selections
  selectedOffers?: Record<string, unknown>;
  selectedServices?: Record<string, unknown>;
  selectedSeats?: Record<string, unknown>;
  selectedBundle?: Record<string, unknown>;
  
  // Pricing
  pricingSnapshots?: PricingSnapshot[];
  paymentFeeInfo?: { feeType: 'FIXED' | 'PERCENTAGE'; rate?: number; amount?: number };
  
  // Passengers
  passengers?: unknown[];
  
  // Order
  orderId?: string;
  pnr?: string;
  
  // Raw responses (for XML viewer)
  rawResponses?: Record<string, { request: string; response: string }>;
  
  // Generic storage
  [key: string]: unknown;
}

export interface SearchCriteria {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  isRoundTrip: boolean;
  passengers: {
    adults: number;
    children: number;
    infants: number;
  };
  promoCode?: string;
  cabinClass?: string;
}

export interface PricingSnapshot {
  stepId: string;
  source: string;
  timestamp: string;
  breakdown: PriceBreakdown;
}

// ============================================================================
// PRICE BREAKDOWN
// ============================================================================

export interface PriceBreakdown {
  currency: string;
  grandTotal: number;
  
  flights: {
    baseFare: number;
    taxTotal: number;
    feeTotal: number;
    total: number;
  };
  
  bundles: Array<{
    bundleId: string;
    bundleName: string;
    price: number;
  }>;
  
  ancillaries: Array<{
    serviceId: string;
    serviceName: string;
    quantity: number;
    price: number;
  }>;
  
  seats: Array<{
    seatNumber: string;
    price: number;
  }>;
  
  taxes: Array<{
    taxCode: string;
    taxName: string;
    amount: number;
  }>;
  
  fees: Array<{
    feeCode: string;
    feeName: string;
    amount: number;
  }>;
  
  discounts: Array<{
    discountCode: string;
    discountName: string;
    amount: number;
    promoCode?: string;
  }>;
  
  paymentSurcharge?: {
    cardType: string;
    amount: number;
  };
}
