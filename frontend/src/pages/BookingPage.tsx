import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { SelectionBreakdown } from '@/components/booking';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';
import { getStepComponent } from '@/services/StepRegistry';
import { AppLayout } from '@/components/layout';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import {
  ChevronRight,
  AlertCircle,
  Check,
  ArrowLeft
} from 'lucide-react';

// Step definition for dynamic workflow
interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  component: string;
}

// Workflow step status for progress indicator
interface WorkflowStepStatus {
  id: string;
  name: string;
  status: 'pending' | 'current' | 'completed';
}

// Build dynamic workflow steps based on selected options
function buildWorkflowSteps(options: Record<string, boolean>): WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  // 1. Always start with Flight Search
  steps.push({
    id: 'search',
    label: 'Search Flights',
    description: 'Search and select your flights',
    component: 'FlightSearch'
  });

  // 2. OfferPrice AFTER flight selection (verify flight + bundle price first)
  if (options.offerPriceAfterShopping) {
    steps.push({
      id: 'offer-price-flight',
      label: 'Verify Price',
      description: 'Confirm flight pricing',
      component: 'OfferPrice'
    });
  }

  // 3. ServiceList - All ancillaries/SSRs in one step (if enabled)
  if (options.addServices) {
    steps.push({
      id: 'services',
      label: 'Add Extras',
      description: 'Add baggage, meals, and other extras',
      component: 'ServiceList'
    });

    // 4. OfferPrice AGAIN after services (verify flight + bundle + services)
    if (options.offerPriceAfterShopping) {
      steps.push({
        id: 'offer-price-services',
        label: 'Verify Total',
        description: 'Confirm pricing with selected services',
        component: 'OfferPrice'
      });
    }
  }

  // 3. Ancillaries - Baggage
  if (options.addBaggage) {
    steps.push({
      id: 'baggage',
      label: 'Baggage',
      description: 'Add checked baggage to your booking',
      component: 'BaggageSelection'
    });
    if (options.offerPriceAfterAncillaries) {
      steps.push({
        id: 'price-baggage',
        label: 'Verify Price',
        description: 'Confirm pricing after baggage',
        component: 'OfferPrice'
      });
    }
  }

  // 4. Ancillaries - Meals
  if (options.addMeals) {
    steps.push({
      id: 'meals',
      label: 'Meals',
      description: 'Select in-flight meals',
      component: 'MealSelection'
    });
    if (options.offerPriceAfterAncillaries) {
      steps.push({
        id: 'price-meals',
        label: 'Verify Price',
        description: 'Confirm pricing after meals',
        component: 'OfferPrice'
      });
    }
  }

  // 5. Ancillaries - Insurance
  if (options.addInsurance) {
    steps.push({
      id: 'insurance',
      label: 'Insurance',
      description: 'Add travel insurance',
      component: 'ServiceSelection'
    });
    if (options.offerPriceAfterAncillaries) {
      steps.push({
        id: 'price-insurance',
        label: 'Verify Price',
        description: 'Confirm pricing after insurance',
        component: 'OfferPrice'
      });
    }
  }

  // 6. Ancillaries - Priority Boarding
  if (options.addPriorityBoarding) {
    steps.push({
      id: 'priority',
      label: 'Priority Boarding',
      description: 'Add priority boarding',
      component: 'ServiceSelection'
    });
    if (options.offerPriceAfterAncillaries) {
      steps.push({
        id: 'price-priority',
        label: 'Verify Price',
        description: 'Confirm pricing after priority',
        component: 'OfferPrice'
      });
    }
  }

  // 7. Seats
  if (options.addSeats) {
    steps.push({
      id: 'seats',
      label: 'Seat Selection',
      description: 'Choose your seats',
      component: 'SeatSelection'
    });
    if (options.offerPriceAfterAncillaries) {
      steps.push({
        id: 'price-seats',
        label: 'Verify Price',
        description: 'Confirm pricing after seats',
        component: 'OfferPrice'
      });
    }
  }

  // 8. Always add Passengers
  steps.push({
    id: 'passengers',
    label: 'Passengers',
    description: 'Enter passenger details',
    component: 'PassengerDetails'
  });

  // 9. Payment / Order Create
  steps.push({
    id: 'payment',
    label: options.holdBooking ? 'Hold Booking' : 'Payment',
    description: options.holdBooking ? 'Create booking on hold' : 'Complete payment',
    component: 'Payment'
  });

  return steps;
}

export function BookingPage() {
  const navigate = useNavigate();

  // Get flight selection from global store for sidebar display
  const flightSelection = useFlightSelectionStore();

  // Default workflow - basic prime booking flow
  // Ancillaries/extras will be added on-the-fly during the booking process
  const workflowOptions = useMemo(() => {
    return {
      offerPriceAfterShopping: true,  // Always verify price after flight selection
      addServices: true,              // Show ServiceList step for all extras (baggage, meals, etc.)
      addBaggage: false,              // Legacy: individual baggage step (disabled in favor of ServiceList)
      addMeals: false,                // Legacy: individual meals step (disabled in favor of ServiceList)
      addInsurance: false,            // Legacy: individual insurance step
      addPriorityBoarding: false,     // Legacy: individual priority boarding step
      addSeats: true,                 // Seat selection (SeatAvailability API) - ENABLED
      offerPriceAfterAncillaries: true,  // Verify price after each ancillary (seats, etc.)
      holdBooking: false,
    };
  }, []);

  // Build dynamic steps from workflow options
  const dynamicSteps = useMemo(() => {
    return buildWorkflowSteps(workflowOptions);
  }, [workflowOptions]);

  // Current step tracking
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Store verified price from OfferPrice step for sidebar display
  const [verifiedTotal, setVerifiedTotal] = useState<number | undefined>(undefined);

  // Build workflow step statuses for progress indicator
  const workflowSteps = useMemo<WorkflowStepStatus[]>(() => {
    return dynamicSteps.map((step, idx) => ({
      id: step.id,
      name: step.label,
      status: idx === currentStepIndex ? 'current' : idx < currentStepIndex ? 'completed' : 'pending'
    }));
  }, [dynamicSteps, currentStepIndex]);


  const handleNextStep = () => {
    if (currentStepIndex < workflowSteps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const { clearCaptures } = useXmlViewer();

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const newIndex = currentStepIndex - 1;
      // Clear XML captures when going back to step 0 (search) to start fresh
      if (newIndex === 0) {
        clearCaptures();
      }
      setCurrentStepIndex(newIndex);
    }
  };

  // Get current step from dynamic steps
  const currentStep = dynamicSteps[currentStepIndex];
  const CurrentStepComponent = currentStep ? getStepComponent(currentStep.component) : null;

  // Generate workflow name based on options
  const workflowName = useMemo(() => {
    const parts: string[] = ['Prime Booking'];
    if (workflowOptions.addBaggage || workflowOptions.addMeals || workflowOptions.addSeats) {
      parts[0] = 'Booking with Extras';
    }
    if (workflowOptions.holdBooking) {
      parts.push('(Hold)');
    }
    return parts.join(' ');
  }, [workflowOptions]);

  // Progress bar component - Compact vertical design with labels
  const progressBar = (
    <div className="max-w-7xl mx-auto px-6 py-3">
      <div className="flex items-start gap-1 overflow-x-auto scrollbar-hide">
        {workflowSteps.map((step, idx) => (
          <div key={step.id} className="flex items-start">
            <div className="flex flex-col items-center gap-1.5 min-w-fit">
              <div className={`${
                step.status === 'current' ? 'w-8 h-8' : 'w-7 h-7'
              } rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step.status === 'completed' ? 'bg-emerald-500 text-white' :
                step.status === 'current' ? 'bg-orange-500 text-white' :
                'bg-slate-100 text-slate-400'
              }`}>
                {step.status === 'completed' ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              {/* Always show label below circle */}
              <span className={`text-[10px] leading-tight text-center max-w-[70px] transition-all ${
                step.status === 'current' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
              }`}>
                {step.name}
              </span>
            </div>
            {idx < workflowSteps.length - 1 && (
              <div className={`w-4 h-0.5 mt-3.5 mx-0.5 flex-shrink-0 ${
                step.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-200'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Sidebar content
  const sidebarContent = (
    <>
      {/* Selection Breakdown - Shows selected flights, bundles, and services for OfferPrice verification */}
      <SelectionBreakdown
        selection={flightSelection.selection}
        shoppingResponseId={flightSelection.shoppingResponseId}
        searchCriteria={flightSelection.searchCriteria || undefined}
        outboundFareInfo={flightSelection.selection.outbound ? {
          fareBasisCode: flightSelection.selection.outbound.fareBasisCode,
          cabinType: flightSelection.selection.outbound.cabinType,
          rbd: flightSelection.selection.outbound.rbd,
        } : undefined}
        inboundFareInfo={flightSelection.selection.inbound ? {
          fareBasisCode: flightSelection.selection.inbound.fareBasisCode,
          cabinType: flightSelection.selection.inbound.cabinType,
          rbd: flightSelection.selection.inbound.rbd,
        } : undefined}
        selectedServices={flightSelection.selectedServices}
        verifiedTotal={verifiedTotal}
      />
      {/* XML Log moved to global XmlLogPanel at bottom of screen (DevTools-style) */}
    </>
  );

  // Footer navigation
  // These steps have their own navigation controls due to special requirements:
  // - FlightSearch: Complex multi-phase flow with search form, then flight selection
  // - OfferPrice: Must wait for API response before allowing continue
  // - PassengerDetails: Form validation required before continue
  // - ServiceList: User selects services, needs Skip/Continue options
  // - Payment: Pay button with loading state and payment processing
  // All other steps use the generic footer for navigation
  const stepsWithOwnNavigation = ['FlightSearch', 'OfferPrice', 'PassengerDetails', 'ServiceList', 'Payment'];
  const footerContent = stepsWithOwnNavigation.includes(currentStep?.component || '') ? undefined : (
    <div className="flex items-center justify-between">
      <button
        onClick={handlePrevStep}
        disabled={currentStepIndex === 0}
        className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-4 h-4" />
        Previous
      </button>

      <div className="text-sm text-slate-500">
        Step {currentStepIndex + 1} of {dynamicSteps.length}
      </div>

      <button
        onClick={handleNextStep}
        disabled={currentStepIndex === dynamicSteps.length - 1}
        className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl"
      >
        {currentStep?.component === 'SeatSelection' ? 'Continue to Price Verification' : 'Next'}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <AppLayout
      title={workflowName}
      backTo="/wizard?mode=prime"
      progressBar={progressBar}
      sidebar={sidebarContent}
      footer={footerContent}
      maxWidth="max-w-7xl"
    >
      {/* Main Content Area */}
      <div className="space-y-6">
        {/* Step-specific content - Always use registered step component */}
        {CurrentStepComponent ? (
          <CurrentStepComponent
            workflowOptions={workflowOptions}
            onComplete={handleNextStep}
            onBack={handlePrevStep}
            onPriceVerified={setVerifiedTotal}
            stepId={currentStep?.id}
          />
        ) : (
          <Card className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-slate-700 font-medium">Step component not found</p>
            <p className="text-sm text-slate-500 mt-1">Component: {currentStep?.component}</p>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

export default BookingPage;
