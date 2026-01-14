import type { ScenarioDefinition } from '@/core/types';
import { scenarioRegistry } from '@/core/registry/ScenarioRegistry';

const standardPreSale: ScenarioDefinition = {
  id: 'standard-pre-sale',
  name: 'Standard Pre-Sale Booking',
  description: 'Full booking flow with flights, services, seats, and payment',
  category: 'prime',
  subcategory: 'booking',
  tags: ['standard', 'full-flow', 'pre-sale'],
  
  steps: [
    {
      id: 'air-shopping',
      operation: 'AirShopping',
      label: 'Search Flights',
      description: 'Search for available flights',
      component: 'AirShoppingStep',
      showsPricing: true,
      pricingSource: 'shopping',
    },
    {
      id: 'service-list',
      operation: 'ServiceList',
      label: 'Select Services',
      description: 'Choose baggage, meals, and other services',
      component: 'ServiceListStep',
      requires: ['air-shopping'],
      optional: true,
    },
    {
      id: 'seat-availability',
      operation: 'SeatAvailability',
      label: 'Select Seats',
      description: 'Choose your preferred seats',
      component: 'SeatAvailabilityStep',
      requires: ['air-shopping'],
      optional: true,
    },
    {
      id: 'offer-price',
      operation: 'OfferPrice',
      label: 'Review Price',
      description: 'Review final price with all selections',
      component: 'OfferPriceStep',
      requires: ['air-shopping'],
      showsPricing: true,
      pricingSource: 'offerprice',
    },
    {
      id: 'passengers',
      operation: 'Passengers',
      label: 'Passenger Details',
      description: 'Enter passenger information',
      component: 'PassengersStep',
      requires: ['offer-price'],
    },
    {
      id: 'order-create',
      operation: 'OrderCreate',
      label: 'Confirm & Pay',
      description: 'Complete your booking',
      component: 'OrderCreateStep',
      requires: ['passengers'],
    },
  ],

  pricingCheckpoints: [
    { stepId: 'air-shopping', label: 'Flight Price' },
    { stepId: 'offer-price', label: 'Final Price', compareWith: 'air-shopping' },
  ],

  ui: {
    icon: 'plane',
    color: 'orange',
    estimatedDuration: '5-10 mins',
    complexity: 'standard',
  },
  
  enabled: true,
};

// Register the scenario
scenarioRegistry.register(standardPreSale);

export default standardPreSale;
