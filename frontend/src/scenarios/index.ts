export * from './pre-sale';
export * from './post-sale';
export * from './servicing';

import { preSaleScenarios } from './pre-sale';
import { postSaleScenarios } from './post-sale';
import { servicingScenarios } from './servicing';

export const allScenarios = [
  ...preSaleScenarios,
  ...postSaleScenarios,
  ...servicingScenarios,
];
