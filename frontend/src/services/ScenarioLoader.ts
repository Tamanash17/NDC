import type { StepDefinition } from '@/core/types/workflow.types';

// Import all scenario JSON files
import scenarioIndex from '@/config/scenarios/index.json';
import requestBundles from '@/config/scenarios/prime/booking/request-bundles.json';
import basicBooking from '@/config/scenarios/prime/booking/basic-booking.json';
import withAncillaries from '@/config/scenarios/prime/booking/with-ancillaries.json';
import orderRetrieve from '@/config/scenarios/servicing/retrieve/order-retrieve.json';
import dateChange from '@/config/scenarios/servicing/changes/date-change.json';
import addServices from '@/config/scenarios/servicing/changes/add-services.json';
import fullCancel from '@/config/scenarios/servicing/cancellation/full-cancel.json';

// Type for the scenario index
export interface ScenarioCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  subcategories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface ScenarioIndex {
  version: string;
  scenarios: string[];
  categories: ScenarioCategory[];
}

// NDC-specific configuration for scenarios
export interface NdcServiceCriteria {
  includeInd: boolean;
  RFIC: string;
  RFISC: string;
}

export interface NdcConfig {
  offerCriteria?: {
    serviceCriteria?: NdcServiceCriteria[];
  };
}

// Extended scenario type that includes JSON-specific fields
export interface LoadedScenario {
  // Identity
  id: string;
  name: string;
  description: string;

  // Categorization
  category: string;
  subcategory: string;
  tags: string[];
  enabled?: boolean;

  // Workflow steps
  steps: Array<StepDefinition & { required?: boolean }>;

  // NDC-specific configuration
  ndcConfig?: NdcConfig;

  // Optional defaults (can be overridden by user inputs)
  defaults?: {
    tripType?: 'oneway' | 'return';
    passengers?: {
      adults: number;
      children: number;
      infants: number;
    };
    [key: string]: unknown;
  };

  // Constraints
  constraints?: {
    maxPassengers?: number;
    minPassengers?: number;
    allowedCurrencies?: string[];
    [key: string]: unknown;
  };

  // UI configuration
  ui?: {
    icon?: string;
    color?: string;
    badge?: string;
    complexity?: 'simple' | 'medium' | 'complex';
  };
}

// Map of scenario IDs to their imported JSON
const scenarioMap: Record<string, LoadedScenario> = {
  'request-bundles': requestBundles as unknown as LoadedScenario,
  'basic-booking': basicBooking as unknown as LoadedScenario,
  'with-ancillaries': withAncillaries as unknown as LoadedScenario,
  'order-retrieve': orderRetrieve as unknown as LoadedScenario,
  'date-change': dateChange as unknown as LoadedScenario,
  'add-services': addServices as unknown as LoadedScenario,
  'full-cancel': fullCancel as unknown as LoadedScenario,
};

class ScenarioLoaderService {
  private cache: Map<string, LoadedScenario> = new Map();
  private indexCache: ScenarioIndex | null = null;

  /**
   * Get the scenario index with categories and subcategories
   */
  getIndex(): ScenarioIndex {
    if (!this.indexCache) {
      this.indexCache = scenarioIndex as ScenarioIndex;
    }
    return this.indexCache;
  }

  /**
   * Get all categories
   */
  getCategories(): ScenarioCategory[] {
    return this.getIndex().categories;
  }

  /**
   * Get a category by ID
   */
  getCategory(categoryId: string): ScenarioCategory | undefined {
    return this.getCategories().find(c => c.id === categoryId);
  }

  /**
   * Load a single scenario by ID
   */
  getScenario(scenarioId: string): LoadedScenario | undefined {
    // Check cache first
    if (this.cache.has(scenarioId)) {
      return this.cache.get(scenarioId);
    }

    // Look up in the scenario map
    const scenario = scenarioMap[scenarioId];
    if (scenario) {
      this.cache.set(scenarioId, scenario);
      return scenario;
    }

    console.warn(`[ScenarioLoader] Scenario not found: ${scenarioId}`);
    return undefined;
  }

  /**
   * Load all scenarios
   */
  getAllScenarios(): LoadedScenario[] {
    return Object.values(scenarioMap);
  }

  /**
   * Get scenarios by category
   */
  getScenariosByCategory(category: 'prime' | 'servicing'): LoadedScenario[] {
    return this.getAllScenarios().filter(s => s.category === category);
  }

  /**
   * Get scenarios by category and subcategory
   */
  getScenariosBySubcategory(category: string, subcategory: string): LoadedScenario[] {
    return this.getAllScenarios().filter(
      s => s.category === category && s.subcategory === subcategory
    );
  }

  /**
   * Search scenarios by name, description, or tags
   */
  searchScenarios(query: string): LoadedScenario[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllScenarios().filter(s => {
      return (
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Get enabled scenarios only
   */
  getEnabledScenarios(): LoadedScenario[] {
    return this.getAllScenarios().filter(s => s.enabled !== false);
  }

  /**
   * Check if a scenario exists
   */
  hasScenario(scenarioId: string): boolean {
    return scenarioId in scenarioMap;
  }

  /**
   * Get the step count for a scenario
   */
  getStepCount(scenarioId: string): number {
    const scenario = this.getScenario(scenarioId);
    return scenario?.steps.length ?? 0;
  }

  /**
   * Get NDC config for a scenario (for XML builder)
   */
  getNdcConfig(scenarioId: string): NdcConfig | undefined {
    const scenario = this.getScenario(scenarioId);
    return scenario?.ndcConfig;
  }

  /**
   * Clear the cache (useful for hot-reloading in development)
   */
  clearCache(): void {
    this.cache.clear();
    this.indexCache = null;
  }
}

// Export singleton instance
export const scenarioLoader = new ScenarioLoaderService();

// Also export the class for testing
export { ScenarioLoaderService };
