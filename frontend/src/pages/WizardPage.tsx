import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWizardSession } from '@/core/context/SessionStore';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { AppLayout } from '@/components/layout';
import { DistributionChainPreview } from '@/components/wizard';
import {
  Users,
  Building2,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Zap,
  Shield,
  Globe
} from 'lucide-react';

type WizardStep = 'booking-type' | 'org-details';

interface OrgDetails {
  orgCode: string;
  orgName: string;
}

export function WizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCaptures } = useXmlViewer();
  const {
    bookingType,
    sellerOrganization,
    distributorOrganization,
    setBookingType,
    setOperationType,
    setSellerOrganization,
    setDistributorOrganization,
  } = useWizardSession();

  // Get operation mode from URL (prime or servicing)
  const mode = searchParams.get('mode') as 'prime' | 'servicing' | null;

  // Clear XML captures when entering the wizard (starting fresh)
  useEffect(() => {
    clearCaptures();
    // Set operation type from URL param
    if (mode === 'prime') {
      setOperationType('PRIME');
    } else if (mode === 'servicing') {
      setOperationType('SERVICING');
    }
  }, [mode]);

  const [currentStep, setCurrentStep] = useState<WizardStep>('booking-type');

  const [sellerOrg, setSellerOrg] = useState<OrgDetails>({
    orgCode: sellerOrganization?.orgCode || '',
    orgName: sellerOrganization?.orgName || ''
  });
  const [distributorOrg, setDistributorOrg] = useState<OrgDetails>({
    orgCode: distributorOrganization?.orgCode || '',
    orgName: distributorOrganization?.orgName || ''
  });

  // Sync local state with store when store values change (e.g., after logout clears them)
  useEffect(() => {
    setSellerOrg({
      orgCode: sellerOrganization?.orgCode || '',
      orgName: sellerOrganization?.orgName || ''
    });
  }, [sellerOrganization]);

  useEffect(() => {
    setDistributorOrg({
      orgCode: distributorOrganization?.orgCode || '',
      orgName: distributorOrganization?.orgName || ''
    });
  }, [distributorOrganization]);

  // Reset wizard to first step when session is cleared (fresh login)
  useEffect(() => {
    if (!bookingType && !sellerOrganization) {
      setCurrentStep('booking-type');
    }
  }, [bookingType, sellerOrganization]);

  // Steps - only 2 steps now (no operation type)
  const steps = [
    { id: 'booking-type' as WizardStep, name: 'Distribution' },
    { id: 'org-details' as WizardStep, name: 'Organization' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'booking-type':
        return bookingType !== null;
      case 'org-details':
        if (bookingType === 'DIRECT') {
          return sellerOrg.orgCode.trim() !== '' && sellerOrg.orgName.trim() !== '';
        } else {
          return sellerOrg.orgCode.trim() !== '' && sellerOrg.orgName.trim() !== '' &&
                 distributorOrg.orgCode.trim() !== '' && distributorOrg.orgName.trim() !== '';
        }
      default:
        return false;
    }
  };

  const goNext = () => {
    if (currentStep === 'booking-type') {
      setCurrentStep('org-details');
    }
  };

  const goBack = () => {
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1].id);
    } else {
      navigate('/dashboard');
    }
  };

  // Start booking - called when user completes organization setup
  const handleStartBooking = () => {
    console.log('[WizardPage] handleStartBooking called');
    console.log('[WizardPage] Setting sellerOrganization:', sellerOrg);
    console.log('[WizardPage] bookingType:', bookingType);

    setSellerOrganization(sellerOrg);
    if (bookingType === 'BOB') {
      console.log('[WizardPage] Setting distributorOrganization:', distributorOrg);
      setDistributorOrganization(distributorOrg);
    }

    // Log what we just set
    console.log('[WizardPage] After set - navigating to:', mode === 'servicing' ? '/manage' : '/booking');

    // Navigate to booking page (for Prime) or manage page (for Servicing)
    if (mode === 'servicing') {
      navigate('/manage');
    } else {
      navigate('/booking');
    }
  };

  // Get page title based on mode
  const getPageTitle = () => {
    if (mode === 'servicing') return 'Manage Booking';
    return 'New Booking';
  };

  // Progress bar component
  const progressBar = (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center justify-center">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                currentStepIndex > idx ? 'bg-emerald-500 text-white'
                : currentStepIndex === idx ? 'bg-orange-500 text-white ring-4 ring-orange-100'
                : 'bg-slate-200 text-slate-400'
              }`}>
                {currentStepIndex > idx ? <Check className="w-5 h-5" /> : idx + 1}
              </div>
              <p className={`text-sm font-semibold ${currentStepIndex >= idx ? 'text-slate-900' : 'text-slate-400'}`}>
                {step.name}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-20 lg:w-32 h-1 mx-4 rounded-full transition-colors ${currentStepIndex > idx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Footer navigation
  const footerContent = (
    <div className="flex items-center justify-between">
      <button onClick={goBack} className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg font-medium transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">Step {currentStepIndex + 1} of {steps.length}</span>

        {isLastStep ? (
          <button
            onClick={handleStartBooking}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition-colors"
          >
            <span>{mode === 'servicing' ? 'Continue to Servicing' : 'Start Booking'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition-colors"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout
      title={getPageTitle()}
      backTo="/dashboard"
      progressBar={progressBar}
      footer={footerContent}
    >
      {/* Step 1: Distribution Type */}
      {currentStep === 'booking-type' && (
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-full mb-4">
              <Globe className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-600">NDC Distribution</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">Select Distribution Type</h1>
            <p className="text-slate-600 max-w-lg mx-auto">
              Choose how you connect to Jetstar's NDC API. This defines your role in the distribution chain.
            </p>
          </div>

          {/* Distribution Type Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Direct Booking Card */}
            <button
              onClick={() => setBookingType('DIRECT')}
              className={`group relative overflow-hidden rounded-xl text-left transition-all duration-300 ${
                bookingType === 'DIRECT'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 ring-2 ring-blue-500 shadow-xl'
                  : 'bg-white border-2 border-slate-200 hover:border-slate-300 hover:shadow-lg'
              }`}
            >
              <div className={`p-6 ${bookingType === 'DIRECT' ? 'text-white' : ''}`}>
                {/* Selection Indicator */}
                {bookingType === 'DIRECT' && (
                  <div className="absolute top-5 right-5 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                    <Check className="w-4 h-4 text-blue-600" />
                  </div>
                )}

                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${
                  bookingType === 'DIRECT' ? 'bg-white/10' : 'bg-slate-100'
                }`}>
                  <Building2 className={`w-7 h-7 ${bookingType === 'DIRECT' ? 'text-white' : 'text-slate-700'}`} />
                </div>

                {/* Title & Description */}
                <h3 className={`text-xl font-bold mb-2 ${bookingType === 'DIRECT' ? 'text-white' : 'text-slate-900'}`}>
                  Direct Booking
                </h3>
                <p className={`text-sm mb-5 ${bookingType === 'DIRECT' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Connect directly as the seller. Ideal for travel agencies selling directly to customers.
                </p>

                {/* Features */}
                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2.5">
                    <Zap className={`w-4 h-4 ${bookingType === 'DIRECT' ? 'text-slate-400' : 'text-slate-400'}`} />
                    <span className={`text-sm ${bookingType === 'DIRECT' ? 'text-slate-300' : 'text-slate-600'}`}>
                      Single organization in chain
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Shield className={`w-4 h-4 ${bookingType === 'DIRECT' ? 'text-slate-400' : 'text-slate-400'}`} />
                    <span className={`text-sm ${bookingType === 'DIRECT' ? 'text-slate-300' : 'text-slate-600'}`}>
                      Full control over bookings
                    </span>
                  </div>
                </div>

                {/* Chain Preview */}
                <div className={`p-3 rounded-lg ${bookingType === 'DIRECT' ? 'bg-white/5' : 'bg-slate-50'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                    bookingType === 'DIRECT' ? 'text-slate-400' : 'text-slate-400'
                  }`}>Distribution Chain</p>
                  <div className="flex items-center gap-2">
                    <div className={`px-3 py-1.5 rounded-lg ${
                      bookingType === 'DIRECT' ? 'bg-white/10' : 'bg-slate-200'
                    }`}>
                      <span className={`text-xs font-semibold ${bookingType === 'DIRECT' ? 'text-white' : 'text-slate-700'}`}>
                        You (Seller)
                      </span>
                    </div>
                    <ArrowRight className={`w-4 h-4 ${bookingType === 'DIRECT' ? 'text-slate-500' : 'text-slate-300'}`} />
                    <div className="px-3 py-1.5 rounded-lg bg-orange-100">
                      <span className="text-xs font-semibold text-orange-600">Jetstar (JQ)</span>
                    </div>
                  </div>
                </div>
              </div>
            </button>

            {/* BOB Card */}
            <button
              onClick={() => setBookingType('BOB')}
              className={`group relative overflow-hidden rounded-xl text-left transition-all duration-300 ${
                bookingType === 'BOB'
                  ? 'bg-slate-700 ring-2 ring-slate-700 shadow-xl'
                  : 'bg-white border-2 border-slate-200 hover:border-slate-300 hover:shadow-lg'
              }`}
            >
              <div className={`p-6 ${bookingType === 'BOB' ? 'text-white' : ''}`}>
                {/* Selection Indicator */}
                {bookingType === 'BOB' && (
                  <div className="absolute top-5 right-5 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                    <Check className="w-4 h-4 text-slate-700" />
                  </div>
                )}

                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${
                  bookingType === 'BOB' ? 'bg-white/10' : 'bg-slate-100'
                }`}>
                  <Users className={`w-7 h-7 ${bookingType === 'BOB' ? 'text-white' : 'text-slate-700'}`} />
                </div>

                {/* Title & Description */}
                <h3 className={`text-xl font-bold mb-2 ${bookingType === 'BOB' ? 'text-white' : 'text-slate-900'}`}>
                  Book on Behalf
                </h3>
                <p className={`text-sm mb-5 ${bookingType === 'BOB' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Act as distributor for sub-agents. Perfect for consolidators and aggregators.
                </p>

                {/* Features */}
                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2.5">
                    <Users className={`w-4 h-4 ${bookingType === 'BOB' ? 'text-slate-400' : 'text-slate-400'}`} />
                    <span className={`text-sm ${bookingType === 'BOB' ? 'text-slate-300' : 'text-slate-600'}`}>
                      Multi-party distribution chain
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Globe className={`w-4 h-4 ${bookingType === 'BOB' ? 'text-slate-400' : 'text-slate-400'}`} />
                    <span className={`text-sm ${bookingType === 'BOB' ? 'text-slate-300' : 'text-slate-600'}`}>
                      Manage sub-agent bookings
                    </span>
                  </div>
                </div>

                {/* Chain Preview */}
                <div className={`p-3 rounded-lg ${bookingType === 'BOB' ? 'bg-white/5' : 'bg-slate-50'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                    bookingType === 'BOB' ? 'text-slate-400' : 'text-slate-400'
                  }`}>Distribution Chain</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`px-2.5 py-1 rounded-lg ${
                      bookingType === 'BOB' ? 'bg-white/10' : 'bg-slate-200'
                    }`}>
                      <span className={`text-xs font-semibold ${bookingType === 'BOB' ? 'text-white' : 'text-slate-700'}`}>
                        Seller
                      </span>
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 ${bookingType === 'BOB' ? 'text-slate-500' : 'text-slate-300'}`} />
                    <div className={`px-2.5 py-1 rounded-lg ${
                      bookingType === 'BOB' ? 'bg-white/10' : 'bg-slate-200'
                    }`}>
                      <span className={`text-xs font-semibold ${bookingType === 'BOB' ? 'text-white' : 'text-slate-700'}`}>
                        You (Dist.)
                      </span>
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 ${bookingType === 'BOB' ? 'text-slate-500' : 'text-slate-300'}`} />
                    <div className="px-2.5 py-1 rounded-lg bg-orange-100">
                      <span className="text-xs font-semibold text-orange-600">JQ</span>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-4 p-5 bg-amber-50 rounded-xl border border-amber-200">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-1">Session-Wide Distribution Chain</h4>
              <p className="text-sm text-slate-600">
                Once configured, your distribution chain will be automatically included in all NDC API requests
                during this session. Change it anytime by returning to this wizard.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Organization Details */}
      {currentStep === 'org-details' && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-3">Organization Details</h1>
            <p className="text-slate-600">
              {bookingType === 'DIRECT' ? 'Enter your organization details' : 'Enter seller and distributor details'}
            </p>
          </div>

          {/* Seller */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`px-6 py-4 border-b ${bookingType === 'BOB' ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${bookingType === 'BOB' ? 'bg-purple-500' : 'bg-slate-700'} flex items-center justify-center`}>
                    {bookingType === 'BOB' ? <Users className="w-5 h-5 text-white" /> : <Building2 className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <p className={`font-bold ${bookingType === 'BOB' ? 'text-purple-900' : 'text-slate-900'}`}>
                      Seller {bookingType === 'BOB' && '(Sub-Agent)'}
                    </p>
                    <p className={`text-xs ${bookingType === 'BOB' ? 'text-purple-600' : 'text-slate-500'}`}>
                      {bookingType === 'BOB' ? 'Organization you are booking for' : 'Your organization'}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${bookingType === 'BOB' ? 'bg-purple-200 text-purple-800' : 'bg-slate-200 text-slate-700'}`}>
                  Ordinal 1
                </span>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Code *</label>
                <input
                  type="text"
                  placeholder="e.g., 55778878"
                  value={sellerOrg.orgCode}
                  onChange={(e) => setSellerOrg(prev => ({ ...prev, orgCode: e.target.value.toUpperCase() }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Name *</label>
                <input
                  type="text"
                  placeholder="e.g., ABC Travel Agency"
                  value={sellerOrg.orgName}
                  onChange={(e) => setSellerOrg(prev => ({ ...prev, orgName: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Distributor - BOB only */}
          {bookingType === 'BOB' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Distributor (You)</p>
                      <p className="text-xs text-slate-500">Your organization</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">Ordinal 2</span>
                </div>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Code *</label>
                  <input
                    type="text"
                    placeholder="e.g., 55778878"
                    value={distributorOrg.orgCode}
                    onChange={(e) => setDistributorOrg(prev => ({ ...prev, orgCode: e.target.value.toUpperCase() }))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Name *</label>
                  <input
                    type="text"
                    placeholder="e.g., Your Company"
                    value={distributorOrg.orgName}
                    onChange={(e) => setDistributorOrg(prev => ({ ...prev, orgName: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Live XML Preview */}
          <DistributionChainPreview
            bookingType={bookingType}
            sellerCode={sellerOrg.orgCode || 'SELLER_CODE'}
            sellerName={sellerOrg.orgName || 'Seller Organization'}
            distributorCode={bookingType === 'BOB' ? (distributorOrg.orgCode || 'DIST_CODE') : undefined}
            distributorName={bookingType === 'BOB' ? (distributorOrg.orgName || 'Distributor Organization') : undefined}
            showXml={true}
          />
        </div>
      )}
    </AppLayout>
  );
}

export default WizardPage;
