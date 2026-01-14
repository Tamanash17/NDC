import { useState, useEffect } from 'react';
import { useWizardSession, useSession } from '@/core/context';
import { cn } from '@/lib/cn';
import { Card, Button, RadioGroup, RadioCard, Input, Alert } from '@/components/ui';
import { MainLayout } from '@/components/layout';
import { scenarioRegistry } from '@/core/registry';
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  UserPlus,
  PlaneTakeoff,
  Wrench,
  Sparkles
} from 'lucide-react';

type WizardStep = 'booking-type' | 'operation-type' | 'seller-details' | 'scenario-select';

export function BookingWizard() {
  const { credentials } = useSession();
  // Build myOrganization from credentials (orgCode/orgName from test-credentials.json)
  const myOrganization = credentials?.orgCode ? {
    orgCode: credentials.orgCode,
    orgName: credentials.orgName || credentials.orgCode,
  } : null;

  const {
    bookingType,
    operationType,
    sellerOrganization,
    selectedScenarioId,
    setBookingType,
    setOperationType,
    setSellerOrganization,
    setSelectedScenario,
  } = useWizardSession();

  const [currentStep, setCurrentStep] = useState<WizardStep>('booking-type');
  const [sellerForm, setSellerForm] = useState({
    orgCode: sellerOrganization?.orgCode || '',
    orgName: sellerOrganization?.orgName || '',
  });

  // Determine step flow based on selections
  // Seller details required for BOTH Direct and BOB bookings
  const getSteps = (): WizardStep[] => {
    const steps: WizardStep[] = ['booking-type', 'operation-type', 'seller-details', 'scenario-select'];
    return steps;
  };

  const steps = getSteps();
  const currentStepIndex = steps.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const goNext = () => {
    // Set seller organization from form when leaving seller-details step
    if (currentStep === 'seller-details') {
      setSellerOrganization({
        orgCode: sellerForm.orgCode,
        orgName: sellerForm.orgName,
      });
    }
    if (!isLastStep) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const goBack = () => {
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'booking-type':
        return bookingType !== null;
      case 'operation-type':
        return operationType !== null;
      case 'seller-details':
        return sellerForm.orgCode.length > 0 && sellerForm.orgName.length > 0;
      case 'scenario-select':
        return selectedScenarioId !== null;
      default:
        return false;
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-neutral-900">Booking Setup</h2>
            <span className="text-sm text-neutral-500">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <Card className="mb-6">
          {currentStep === 'booking-type' && (
            <StepBookingType
              value={bookingType}
              onChange={setBookingType}
              myOrgName={myOrganization?.orgName}
            />
          )}

          {currentStep === 'operation-type' && (
            <StepOperationType
              value={operationType}
              onChange={setOperationType}
            />
          )}

          {currentStep === 'seller-details' && (
            <StepSellerDetails
              value={sellerForm}
              onChange={setSellerForm}
              distributorOrg={myOrganization}
            />
          )}

          {currentStep === 'scenario-select' && (
            <StepScenarioSelect
              operationType={operationType!}
              value={selectedScenarioId}
              onChange={setSelectedScenario}
            />
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={isFirstStep}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>

          {isLastStep ? (
            <Button
              variant="primary"
              disabled={!canProceed()}
              rightIcon={<Sparkles className="h-4 w-4" />}
            >
              Start Booking
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={!canProceed()}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// ============================================================================
// STEP: BOOKING TYPE
// ============================================================================

interface StepBookingTypeProps {
  value: 'DIRECT' | 'BOB' | null;
  onChange: (value: 'DIRECT' | 'BOB') => void;
  myOrgName?: string;
}

function StepBookingType({ value, onChange, myOrgName }: StepBookingTypeProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
        Who is making this booking?
      </h3>
      <p className="text-neutral-500 mb-6">
        This determines how the distribution chain is set up.
      </p>

      <RadioGroup
        value={value || undefined}
        onChange={(v) => onChange(v as 'DIRECT' | 'BOB')}
        name="booking-type"
      >
        <RadioCard
          value="DIRECT"
          title="Direct Booking"
          description="You are the seller. Your organization will be recorded in the distribution chain."
          icon={<Building2 className="h-5 w-5" />}
        >
          <div className="mt-3 px-3 py-2 bg-neutral-50 rounded-lg text-sm">
            <span className="text-neutral-500">Distribution Chain:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-medium text-neutral-900">{myOrgName || 'Your Org'}</span>
              <ArrowRight className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-600">Jetstar</span>
            </div>
          </div>
        </RadioCard>

        <RadioCard
          value="BOB"
          title="Booking on Behalf"
          description="You are booking for a sub-agent. You will be the Distributor in the chain."
          icon={<UserPlus className="h-5 w-5" />}
        >
          <div className="mt-3 px-3 py-2 bg-neutral-50 rounded-lg text-sm">
            <span className="text-neutral-500">Distribution Chain:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-primary-600">[Seller - you'll enter]</span>
              <ArrowRight className="h-4 w-4 text-neutral-400" />
              <span className="font-medium text-neutral-900">{myOrgName || 'Your Org'}</span>
              <ArrowRight className="h-4 w-4 text-neutral-400" />
              <span className="text-neutral-600">Jetstar</span>
            </div>
          </div>
        </RadioCard>
      </RadioGroup>
    </div>
  );
}

// ============================================================================
// STEP: OPERATION TYPE
// ============================================================================

interface StepOperationTypeProps {
  value: 'PRIME' | 'SERVICING' | null;
  onChange: (value: 'PRIME' | 'SERVICING') => void;
}

function StepOperationType({ value, onChange }: StepOperationTypeProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
        What would you like to do?
      </h3>
      <p className="text-neutral-500 mb-6">
        Choose whether to create a new booking or manage an existing one.
      </p>

      <RadioGroup
        value={value || undefined}
        onChange={(v) => onChange(v as 'PRIME' | 'SERVICING')}
        name="operation-type"
      >
        <RadioCard
          value="PRIME"
          title="Prime Booking"
          description="Create a new booking from scratch - search flights, select extras, enter passengers, and pay."
          icon={<PlaneTakeoff className="h-5 w-5" />}
          badge="New Booking"
        />

        <RadioCard
          value="SERVICING"
          title="Servicing"
          description="Manage an existing booking - add services, change seats, modify flights, or cancel."
          icon={<Wrench className="h-5 w-5" />}
          badge="Existing Booking"
        />
      </RadioGroup>
    </div>
  );
}

// ============================================================================
// STEP: SELLER DETAILS (BOB only)
// ============================================================================

interface StepSellerDetailsProps {
  value: { orgCode: string; orgName: string };
  onChange: (value: { orgCode: string; orgName: string }) => void;
  distributorOrg: { orgCode: string; orgName: string } | null;
}

function StepSellerDetails({ value, onChange, distributorOrg }: StepSellerDetailsProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
        Seller Details
      </h3>
      <p className="text-neutral-500 mb-6">
        Enter the organization you are booking on behalf of.
      </p>

      <div className="space-y-4">
        <div className="p-4 bg-primary-50 border border-primary-100 rounded-lg">
          <p className="text-sm font-medium text-primary-900">Seller (Ordinal 1)</p>
          <p className="text-xs text-primary-700 mb-4">The organization you are booking for</p>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Org Code"
              value={value.orgCode}
              onChange={(e) => onChange({ ...value, orgCode: e.target.value })}
              placeholder="e.g., 12345678"
              required
            />
            <Input
              label="Org Name"
              value={value.orgName}
              onChange={(e) => onChange({ ...value, orgName: e.target.value })}
              placeholder="e.g., ABC Travel"
              required
            />
          </div>
        </div>

        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
          <p className="text-sm font-medium text-neutral-700">Distributor (Ordinal 2) - Your Organization</p>
          <div className="mt-2 text-sm text-neutral-600">
            <p><span className="font-medium">Org Code:</span> {distributorOrg?.orgCode}</p>
            <p><span className="font-medium">Org Name:</span> {distributorOrg?.orgName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP: SCENARIO SELECT
// ============================================================================

interface StepScenarioSelectProps {
  operationType: 'PRIME' | 'SERVICING';
  value: string | null;
  onChange: (scenarioId: string) => void;
}

function StepScenarioSelect({ operationType, value, onChange }: StepScenarioSelectProps) {
  const category = operationType === 'PRIME' ? 'prime' : 'servicing';
  const scenarios = scenarioRegistry.getByCategory(category);

  return (
    <div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
        Select Scenario
      </h3>
      <p className="text-neutral-500 mb-6">
        Choose the workflow that best fits your needs.
      </p>

      {scenarios.length === 0 ? (
        <Alert variant="warning">
          No scenarios available for this category. Please run the scenario registration.
        </Alert>
      ) : (
        <RadioGroup
          value={value || undefined}
          onChange={onChange}
          name="scenario"
        >
          {scenarios.map((scenario) => (
            <RadioCard
              key={scenario.id}
              value={scenario.id}
              title={scenario.name}
              description={scenario.description}
              badge={scenario.ui?.badge}
            >
              <div className="mt-2 flex flex-wrap gap-1">
                {scenario.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 rounded"
                  >
                    {tag}
                  </span>
                ))}
                <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
                  {scenario.steps.length} steps
                </span>
              </div>
            </RadioCard>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}
