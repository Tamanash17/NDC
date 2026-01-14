import type { ScenarioDefinition } from '@/core/types';
import { scenarioRegistry } from '@/core/registry/ScenarioRegistry';

const postSaleAddServices: ScenarioDefinition = {
  id: 'post-sale-add-services',
  name: 'Add Services to Existing Booking',
  description: 'Add baggage, meals, or seats to an existing PNR',
  category: 'servicing',
  subcategory: 'modify',
  tags: ['post-sale', 'services', 'modify'],
  
  steps: [
    {
      id: 'order-retrieve',
      operation: 'OrderRetrieve',
      label: 'Retrieve Booking',
      description: 'Enter your PNR to retrieve the booking',
      component: 'OrderRetrieveStep',
    },
    {
      id: 'service-list',
      operation: 'ServiceList',
      label: 'Select Services',
      description: 'Choose additional services to add',
      component: 'ServiceListStep',
      requires: ['order-retrieve'],
    },
    {
      id: 'order-quote',
      operation: 'OrderQuote',
      label: 'Review Changes',
      description: 'Review price for additional services',
      component: 'OrderQuoteStep',
      requires: ['service-list'],
      showsPricing: true,
    },
    {
      id: 'order-change',
      operation: 'OrderChange',
      label: 'Confirm Changes',
      description: 'Confirm and pay for changes',
      component: 'OrderChangeStep',
      requires: ['order-quote'],
    },
  ],

  ui: {
    icon: 'plus-circle',
    color: 'green',
    estimatedDuration: '3-5 mins',
    complexity: 'simple',
  },
  
  enabled: true,
};

scenarioRegistry.register(postSaleAddServices);

export default postSaleAddServices;
