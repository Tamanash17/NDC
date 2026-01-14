import type { ComponentType } from 'react';

// Import all step components
import { AirShoppingStep } from '@/steps/air-shopping/AirShoppingStep';
import { OfferPriceStep } from '@/steps/offer-price/OfferPriceStep';
import { ServiceListStep } from '@/steps/service-list/ServiceListStep';
import { SeatAvailabilityStep } from '@/steps/seat-availability/SeatAvailabilityStep';
import { SeatSelectionStep } from '@/steps/seat-selection/SeatSelectionStep';
import { PassengersStep } from '@/steps/passengers/PassengersStep';
import { OrderCreateStep } from '@/steps/order-create/OrderCreateStep';
import { OrderRetrieveStep } from '@/steps/order-retrieve/OrderRetrieveStep';
import { OrderReshopStep } from '@/steps/order-reshop/OrderReshopStep';
import { OrderQuoteStep } from '@/steps/order-quote/OrderQuoteStep';
import { OrderChangeStep } from '@/steps/order-change/OrderChangeStep';
import { OrderCancelStep } from '@/steps/order-cancel/OrderCancelStep';

/**
 * Registry of step components mapped by their component name
 *
 * To add a new step component:
 * 1. Create the component in /src/steps/{name}/{Name}Step.tsx
 * 2. Import it above
 * 3. Add it to the STEP_COMPONENTS map below
 * 4. Reference it by name in scenario JSON files
 */
export const STEP_COMPONENTS: Record<string, ComponentType<any>> = {
  // Flight Search & Selection
  'FlightSearch': AirShoppingStep,
  'FlightSelection': OfferPriceStep,
  'OfferPrice': OfferPriceStep,

  // Passengers
  'PassengerDetails': PassengersStep,
  'ContactDetails': PassengersStep, // Uses same component with different config

  // Ancillaries / Services
  'ServiceList': ServiceListStep,
  'Ancillaries': ServiceListStep,
  'SeatSelection': SeatSelectionStep,
  'SeatAvailability': SeatAvailabilityStep,
  'BaggageSelection': ServiceListStep,
  'MealSelection': ServiceListStep,
  'ServiceSelection': ServiceListStep,

  // Order Operations
  'OrderLookup': OrderRetrieveStep,
  'OrderView': OrderRetrieveStep,

  // Changes
  'SegmentSelector': OrderReshopStep,
  'DateSelector': OrderReshopStep,
  'ChangeReview': OrderQuoteStep,

  // Payment & Confirmation
  'Payment': OrderCreateStep,
  'Confirmation': OrderCreateStep,
  'BookingReview': OrderQuoteStep,

  // Cancellation
  'CancellationReview': OrderQuoteStep,
  'CancellationProcess': OrderChangeStep,
  'CancellationConfirmation': OrderCancelStep,
  'ChangeConfirmation': OrderChangeStep,
  'ServiceReview': OrderQuoteStep,
  'ServiceConfirmation': OrderChangeStep,
};

/**
 * Get a step component by name
 */
export function getStepComponent(componentName: string): ComponentType<any> | undefined {
  const component = STEP_COMPONENTS[componentName];
  if (!component) {
    console.warn(`[StepRegistry] Component not found: ${componentName}`);
  }
  return component;
}

/**
 * Check if a component exists in the registry
 */
export function hasStepComponent(componentName: string): boolean {
  return componentName in STEP_COMPONENTS;
}

/**
 * Get all registered component names
 */
export function getRegisteredComponents(): string[] {
  return Object.keys(STEP_COMPONENTS);
}

/**
 * Validate that all components in a scenario exist in the registry
 */
export function validateScenarioComponents(componentNames: string[]): {
  valid: boolean;
  missing: string[];
} {
  const missing = componentNames.filter(name => !hasStepComponent(name));
  return {
    valid: missing.length === 0,
    missing,
  };
}
