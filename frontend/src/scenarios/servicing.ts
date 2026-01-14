import type { Scenario } from '@/core/types';

export const dateChangeScenario: Scenario = {
  id: 'date-change',
  name: 'Date Change',
  description: 'Change your travel date to another available date',
  category: 'servicing',
  steps: [
    { id: 'retrieve', name: 'Find Booking', operation: 'OrderRetrieve' },
    { id: 'reshop', name: 'Select New Date', operation: 'OrderReshop' },
    { id: 'quote', name: 'Review Quote', operation: 'OfferPrice' },
    { id: 'change', name: 'Confirm Change', operation: 'OrderChange' },
  ],
  requiredContext: ['orderId'],
};

export const flightChangeScenario: Scenario = {
  id: 'flight-change',
  name: 'Flight Change',
  description: 'Change to a different flight on the same date',
  category: 'servicing',
  steps: [
    { id: 'retrieve', name: 'Find Booking', operation: 'OrderRetrieve' },
    { id: 'reshop', name: 'Select New Flight', operation: 'OrderReshop' },
    { id: 'quote', name: 'Review Quote', operation: 'OfferPrice' },
    { id: 'change', name: 'Confirm Change', operation: 'OrderChange' },
  ],
  requiredContext: ['orderId'],
};

export const addServicesScenario: Scenario = {
  id: 'add-services',
  name: 'Add Extras',
  description: 'Add baggage, meals, or other services to your booking',
  category: 'servicing',
  steps: [
    { id: 'retrieve', name: 'Find Booking', operation: 'OrderRetrieve' },
    { id: 'services', name: 'Select Services', operation: 'ServiceList' },
    { id: 'quote', name: 'Review Quote', operation: 'OfferPrice' },
    { id: 'change', name: 'Confirm Addition', operation: 'OrderChange' },
  ],
  requiredContext: ['orderId'],
};

export const addSeatsScenario: Scenario = {
  id: 'add-seats',
  name: 'Select Seats',
  description: 'Choose or change your seat selection',
  category: 'servicing',
  steps: [
    { id: 'retrieve', name: 'Find Booking', operation: 'OrderRetrieve' },
    { id: 'seats', name: 'Select Seats', operation: 'SeatAvailability' },
    { id: 'quote', name: 'Review Quote', operation: 'OfferPrice' },
    { id: 'change', name: 'Confirm Selection', operation: 'OrderChange' },
  ],
  requiredContext: ['orderId'],
};

export const cancelBookingScenario: Scenario = {
  id: 'cancel-booking',
  name: 'Cancel Booking',
  description: 'Cancel your booking and request a refund',
  category: 'servicing',
  steps: [
    { id: 'retrieve', name: 'Find Booking', operation: 'OrderRetrieve' },
    { id: 'quote', name: 'Review Refund', operation: 'OfferPrice' },
    { id: 'cancel', name: 'Confirm Cancel', operation: 'OrderChange' },
  ],
  requiredContext: ['orderId'],
};

export const servicingScenarios = [
  dateChangeScenario,
  flightChangeScenario,
  addServicesScenario,
  addSeatsScenario,
  cancelBookingScenario,
];
