import { create } from 'zustand';
import type { 
  ScenarioDefinition, 
  StepDefinition, 
  WorkflowState, 
  WorkflowContext,
  StepResult,
  PricingSnapshot
} from '@/core/types';
import { scenarioRegistry } from '@/core/registry/ScenarioRegistry';

// ============================================================================
// WORKFLOW STORE
// ============================================================================

interface WorkflowStore {
  // State
  state: WorkflowState | null;
  
  // Actions
  startWorkflow: (scenarioId: string, initialContext: Partial<WorkflowContext>) => void;
  goToStep: (stepIndex: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  completeStep: (stepId: string, result: Omit<StepResult, 'stepId' | 'timestamp'>) => void;
  updateContext: (updates: Partial<WorkflowContext>) => void;
  addPricingSnapshot: (snapshot: Omit<PricingSnapshot, 'timestamp'>) => void;
  setError: (error: string | null) => void;
  resetWorkflow: () => void;
  
  // Getters
  getCurrentStep: () => StepDefinition | null;
  getScenario: () => ScenarioDefinition | null;
  canGoNext: () => boolean;
  canGoPrevious: () => boolean;
  isStepCompleted: (stepId: string) => boolean;
  getProgress: () => { current: number; total: number; percentage: number };
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  state: null,

  startWorkflow: (scenarioId, initialContext) => {
    const scenario = scenarioRegistry.get(scenarioId);
    if (!scenario) {
      console.error(`[WorkflowEngine] Scenario not found: ${scenarioId}`);
      return;
    }

    const context: WorkflowContext = {
      bookingType: 'DIRECT',
      operationType: 'PRIME',
      myOrganization: { orgCode: '', orgName: '' },
      ...initialContext,
    };

    set({
      state: {
        scenarioId,
        currentStepIndex: 0,
        completedSteps: [],
        stepResults: {},
        context,
        status: 'running',
      },
    });

    console.log(`[WorkflowEngine] Started workflow: ${scenarioId}`);
  },

  goToStep: (stepIndex) => {
    const { state } = get();
    if (!state) return;

    const scenario = scenarioRegistry.get(state.scenarioId);
    if (!scenario) return;

    if (stepIndex < 0 || stepIndex >= scenario.steps.length) {
      console.warn(`[WorkflowEngine] Invalid step index: ${stepIndex}`);
      return;
    }

    set({
      state: {
        ...state,
        currentStepIndex: stepIndex,
      },
    });
  },

  nextStep: () => {
    const { state, goToStep } = get();
    console.log('[WorkflowEngine] nextStep called, state:', state?.currentStepIndex, state?.scenarioId);
    if (!state) {
      console.error('[WorkflowEngine] nextStep: No state!');
      return;
    }

    const scenario = scenarioRegistry.get(state.scenarioId);
    console.log('[WorkflowEngine] scenario:', scenario?.id, 'steps:', scenario?.steps?.length);
    if (!scenario) {
      console.error('[WorkflowEngine] nextStep: No scenario!');
      return;
    }

    const nextIndex = state.currentStepIndex + 1;
    console.log('[WorkflowEngine] Moving from step', state.currentStepIndex, 'to', nextIndex);
    if (nextIndex < scenario.steps.length) {
      goToStep(nextIndex);
      console.log('[WorkflowEngine] goToStep called for index', nextIndex);
    } else {
      // Workflow completed
      set({
        state: {
          ...state,
          status: 'completed',
        },
      });
      console.log(`[WorkflowEngine] Workflow completed: ${state.scenarioId}`);
    }
  },

  previousStep: () => {
    const { state, goToStep } = get();
    if (!state) return;

    const prevIndex = state.currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(prevIndex);
    }
  },

  completeStep: (stepId, result) => {
    const { state } = get();
    if (!state) return;

    const stepResult: StepResult = {
      stepId,
      ...result,
      timestamp: new Date().toISOString(),
    };

    set({
      state: {
        ...state,
        completedSteps: [...state.completedSteps, stepId],
        stepResults: {
          ...state.stepResults,
          [stepId]: stepResult,
        },
      },
    });

    console.log(`[WorkflowEngine] Step completed: ${stepId}`);
  },

  updateContext: (updates) => {
    const { state } = get();
    if (!state) return;

    set({
      state: {
        ...state,
        context: {
          ...state.context,
          ...updates,
        },
      },
    });
  },

  addPricingSnapshot: (snapshot) => {
    const { state } = get();
    if (!state) return;

    const fullSnapshot: PricingSnapshot = {
      ...snapshot,
      timestamp: new Date().toISOString(),
    };

    set({
      state: {
        ...state,
        context: {
          ...state.context,
          pricingSnapshots: [
            ...(state.context.pricingSnapshots || []),
            fullSnapshot,
          ],
        },
      },
    });
  },

  setError: (error) => {
    const { state } = get();
    if (!state) return;

    set({
      state: {
        ...state,
        status: error ? 'error' : 'running',
        error: error || undefined,
      },
    });
  },

  resetWorkflow: () => {
    set({ state: null });
    console.log('[WorkflowEngine] Workflow reset');
  },

  getCurrentStep: () => {
    const { state } = get();
    if (!state) return null;

    const scenario = scenarioRegistry.get(state.scenarioId);
    if (!scenario) return null;

    return scenario.steps[state.currentStepIndex] || null;
  },

  getScenario: () => {
    const { state } = get();
    if (!state) return null;
    return scenarioRegistry.get(state.scenarioId) || null;
  },

  canGoNext: () => {
    const { state, getCurrentStep } = get();
    if (!state) return false;

    const currentStep = getCurrentStep();
    if (!currentStep) return false;

    // Can go next if current step is completed or optional
    return state.completedSteps.includes(currentStep.id) || currentStep.optional === true;
  },

  canGoPrevious: () => {
    const { state } = get();
    if (!state) return false;
    return state.currentStepIndex > 0;
  },

  isStepCompleted: (stepId) => {
    const { state } = get();
    if (!state) return false;
    return state.completedSteps.includes(stepId);
  },

  getProgress: () => {
    const { state } = get();
    if (!state) return { current: 0, total: 0, percentage: 0 };

    const scenario = scenarioRegistry.get(state.scenarioId);
    if (!scenario) return { current: 0, total: 0, percentage: 0 };

    const current = state.currentStepIndex + 1;
    const total = scenario.steps.length;
    const percentage = Math.round((current / total) * 100);

    return { current, total, percentage };
  },
}));

// ============================================================================
// WORKFLOW HOOKS
// ============================================================================

/**
 * Hook to access workflow state and actions
 */
export function useWorkflow() {
  const store = useWorkflowStore();
  
  return {
    // State
    state: store.state,
    currentStep: store.getCurrentStep(),
    scenario: store.getScenario(),
    context: store.state?.context,
    progress: store.getProgress(),
    
    // Actions
    startWorkflow: store.startWorkflow,
    nextStep: store.nextStep,
    previousStep: store.previousStep,
    goToStep: store.goToStep,
    completeStep: store.completeStep,
    updateContext: store.updateContext,
    addPricingSnapshot: store.addPricingSnapshot,
    setError: store.setError,
    resetWorkflow: store.resetWorkflow,
    
    // Checks
    canGoNext: store.canGoNext(),
    canGoPrevious: store.canGoPrevious(),
    isStepCompleted: store.isStepCompleted,
    isCompleted: store.state?.status === 'completed',
    hasError: store.state?.status === 'error',
  };
}
