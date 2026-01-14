import type { ScenarioDefinition } from '@/core/types';

/**
 * Scenario Registry - Plugin system for booking scenarios
 * 
 * Scenarios register themselves here and can be retrieved by ID, category, or tags.
 * Adding a new scenario is as simple as creating a new file and calling register().
 */
class ScenarioRegistryClass {
  private scenarios: Map<string, ScenarioDefinition> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private tags: Map<string, Set<string>> = new Map();
  private initialized = false;

  /**
   * Register a new scenario
   */
  register(scenario: ScenarioDefinition): void {
    if (this.scenarios.has(scenario.id)) {
      console.warn(`[ScenarioRegistry] Scenario "${scenario.id}" already registered, overwriting...`);
    }

    // Default enabled to true if not specified
    if (scenario.enabled === undefined) {
      scenario.enabled = true;
    }

    this.scenarios.set(scenario.id, scenario);

    // Index by category
    if (!this.categories.has(scenario.category)) {
      this.categories.set(scenario.category, new Set());
    }
    this.categories.get(scenario.category)!.add(scenario.id);

    // Index by tags
    scenario.tags.forEach((tag) => {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(scenario.id);
    });

    console.log(`[ScenarioRegistry] ✓ Registered: ${scenario.id} (${scenario.name})`);
  }

  /**
   * Get a scenario by ID
   */
  get(id: string): ScenarioDefinition | undefined {
    return this.scenarios.get(id);
  }

  /**
   * Get all scenarios
   */
  getAll(): ScenarioDefinition[] {
    return Array.from(this.scenarios.values()).filter(s => s.enabled);
  }

  /**
   * Get scenarios by category
   */
  getByCategory(category: 'prime' | 'servicing'): ScenarioDefinition[] {
    const ids = this.categories.get(category) || new Set();
    return Array.from(ids)
      .map((id) => this.scenarios.get(id)!)
      .filter(s => s.enabled);
  }

  /**
   * Get scenarios by tag
   */
  getByTag(tag: string): ScenarioDefinition[] {
    const ids = this.tags.get(tag) || new Set();
    return Array.from(ids)
      .map((id) => this.scenarios.get(id)!)
      .filter(s => s.enabled);
  }

  /**
   * Search scenarios
   */
  search(query: string): ScenarioDefinition[] {
    const q = query.toLowerCase();
    return this.getAll().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  /**
   * Get total scenario count
   */
  count(): number {
    return this.scenarios.size;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    console.log(`[ScenarioRegistry] Initialized with ${this.count()} scenarios`);
  }
}

// Singleton instance
export const scenarioRegistry = new ScenarioRegistryClass();

// ============================================================================
// SCENARIO INITIALIZATION
// ============================================================================

/**
 * Initialize all scenarios
 * This function dynamically imports all scenario modules
 */
export async function initializeScenarios(): Promise<void> {
  if (scenarioRegistry.isInitialized()) {
    return;
  }

  console.log('[ScenarioRegistry] Initializing scenarios...');

  // Import all scenario modules
  // These will self-register when imported
  const scenarioModules = import.meta.glob('@/scenarios/**/*.scenario.ts', { eager: true });

  // The scenarios register themselves on import
  // We just need to wait for all imports

  scenarioRegistry.markInitialized();
}
