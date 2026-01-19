import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDistributionContext, useSession } from '@/core/context/SessionStore';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { processPayment, ccFees as fetchCCFeesFromOrder, type CCFeeResult } from '@/lib/ndc-api';
import { formatCurrency } from '@/lib/format';
import { AppLayout } from '@/components/layout';
import {
  CreditCard,
  Building2,
  Wallet,
  Lock,
  CheckCircle,
  Loader2,
  Shield,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Plane,
  Info,
} from 'lucide-react';

// Payment method types
type PaymentMethod = 'CC' | 'AGT' | 'IFG';

// Card brands supported
const CARD_BRANDS = [
  { code: 'VI', name: 'Visa', pattern: /^4/ },
  { code: 'MC', name: 'Mastercard', pattern: /^5[1-5]/ },
  { code: 'AX', name: 'American Express', pattern: /^3[47]/ },
  { code: 'DC', name: 'Diners Club', pattern: /^3(?:0[0-5]|[68])/ },
  { code: 'JC', name: 'JCB', pattern: /^(?:2131|1800|35)/ },
  { code: 'UP', name: 'UnionPay', pattern: /^62/ },
];

interface CardPaymentForm {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

interface AgencyPaymentForm {
  selectedParticipant: 'seller' | 'distributor';
}

/**
 * ServicePaymentPage - Payment page for servicing flow (from Manage Booking)
 *
 * This is a simplified version of PaymentPage specifically for servicing scenarios:
 * - Gets all data from URL params (no flight store dependency)
 * - No CC fee calculation (Long Sell requires flight data we don't have)
 * - Back button goes to Manage Booking page
 * - Same OrderChange payment API as prime flow
 */
export function ServicePaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const distributionContext = useDistributionContext();
  const { addCapture } = useXmlViewer();
  const { environment } = useSession();

  // Check if we're in PROD environment - payment is not allowed in PROD
  const isProdEnvironment = environment === 'PROD';

  // Get booking details from URL params ONLY
  const orderId = searchParams.get('orderId') || '';
  const pnr = searchParams.get('pnr') || '';
  const initialAmount = parseFloat(searchParams.get('amount') || '0');
  const currency = searchParams.get('currency') || 'AUD';
  const mode = searchParams.get('mode') || 'complete'; // 'complete' or 'add'
  const isAddMode = mode === 'add';

  // For add mode, allow user to enter custom amount
  const [customAmount, setCustomAmount] = useState<string>(isAddMode ? '' : String(initialAmount));
  const totalAmount = isAddMode ? parseFloat(customAmount || '0') : initialAmount;

  // Back navigation always goes to manage booking
  const backTo = `/manage?pnr=${encodeURIComponent(pnr)}`;

  // State
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CC');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false); // Prevent duplicate submissions
  const [error, setError] = useState<string | null>(null);
  const [errorWarnings, setErrorWarnings] = useState<string[]>([]); // Separate warnings for detailed display
  const [success, setSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0); // Track actual amount paid (including CC fee)

  // CC fees state - same as PaymentPage for credit card surcharge calculation
  const [ccFees, setCCFees] = useState<CCFeeResult[]>([]);
  const [isLoadingCCFees, setIsLoadingCCFees] = useState(false);
  const [ccFeesError, setCCFeesError] = useState<string | null>(null);

  // Form states
  const [cardForm, setCardForm] = useState<CardPaymentForm>({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
  });

  const [agencyForm, setAgencyForm] = useState<AgencyPaymentForm>({
    selectedParticipant: 'seller',
  });

  // Check if this is a BOB booking
  const isBOBBooking = distributionContext.isValid &&
    (distributionContext.getPartyConfig()?.participants?.length || 0) > 1;

  // Get participant details
  const sellerInfo = distributionContext.seller;
  const distributorInfo = distributionContext.getPartyConfig()?.participants?.find(p => p.role === 'Distributor');

  // Detect card brand
  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    for (const brand of CARD_BRANDS) {
      if (brand.pattern.test(cleaned)) {
        return brand.code;
      }
    }
    return 'VI';
  };

  // Fetch CC fees using OrderRetrieve + Long Sell (same approach as PaymentPage)
  const fetchCCFeesNow = async () => {
    if (!orderId) {
      console.log('[ServicePaymentPage] No order ID available, skipping CC fee fetch');
      setCCFeesError('No order ID available for CC fee calculation');
      return;
    }

    setIsLoadingCCFees(true);
    setCCFeesError(null);

    try {
      console.log('[ServicePaymentPage] Fetching CC fees for order:', orderId);

      const startTime = Date.now();

      // Build distribution chain for the request
      const distributionChain = distributionContext.isValid ? {
        ownerCode: 'JQ',
        links: distributionContext.getPartyConfig()?.participants?.map((p, idx) => ({
          ordinal: idx + 1,
          orgRole: p.role === 'Seller' ? 'Seller' : 'Distributor',
          orgId: p.orgCode || '',
          orgName: p.orgName || '',
        })) || [],
      } : undefined;

      const response = await fetchCCFeesFromOrder({
        orderId,
        ownerCode: 'JQ',
        currency,
        distributionChain,
      });

      const duration = Date.now() - startTime;
      setCCFees(response.fees);

      console.log('[ServicePaymentPage] CC fees fetched successfully');
      // Log XML response for each card brand
      response.fees.forEach((fee) => {
        console.log(`[ServicePaymentPage] ${fee.cardBrand} surcharge: ${fee.ccSurcharge}`);
        if (fee.requestXml) {
          console.log(`[ServicePaymentPage] ${fee.cardBrand} Request XML:\n`, fee.requestXml);
        }
        if (fee.rawResponse) {
          console.log(`[ServicePaymentPage] ${fee.cardBrand} Response XML:\n`, fee.rawResponse);
        }
      });

      // Add to XML Logs panel
      const visaFee = response.fees.find(f => f.cardBrand === 'VI');
      if (visaFee && visaFee.requestXml) {
        addCapture({
          operation: 'CCFees (Service - OrderRetrieve + LongSell)',
          request: visaFee.requestXml || '',
          response: visaFee.rawResponse || '',
          duration,
          status: visaFee.error ? 'error' : 'success',
          userAction: `Fetched CC fees for order ${orderId}: Visa=${visaFee.ccSurcharge > 0 ? `$${visaFee.ccSurcharge.toFixed(2)}` : 'No fee'}`,
        });
      }
    } catch (err: any) {
      console.error('[ServicePaymentPage] Error fetching CC fees:', err);
      setCCFeesError(err.message || 'Failed to fetch CC fees');
    } finally {
      setIsLoadingCCFees(false);
    }
  };

  // Auto-fetch CC fees when order ID is available
  useEffect(() => {
    if (orderId) {
      fetchCCFeesNow();
    }
  }, [orderId, currency]);

  // Get CC fee for currently detected card brand
  const getCurrentCardFee = (): CCFeeResult | null => {
    if (ccFees.length === 0 || !cardForm.cardNumber) return null;
    const brand = detectCardBrand(cardForm.cardNumber);
    return ccFees.find(f => f.cardBrand === brand) || null;
  };

  // Calculate total with CC fee
  const getCurrentCardTotal = (): number => {
    const fee = getCurrentCardFee();
    return totalAmount + (fee?.ccSurcharge || 0);
  };

  // Format card number with spaces
  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  // Validate forms
  const validateCreditCard = (): boolean => {
    return (
      cardForm.cardNumber.replace(/\s/g, '').length >= 13 &&
      cardForm.cardholderName.length >= 2 &&
      cardForm.expiryMonth.length === 2 &&
      cardForm.expiryYear.length === 2 &&
      cardForm.cvv.length >= 3
    );
  };

  const validateAgencyPayment = (): boolean => {
    return agencyForm.selectedParticipant === 'seller' ||
      (agencyForm.selectedParticipant === 'distributor' && isBOBBooking);
  };

  const canSubmit = (): boolean => {
    // Prevent submission if already processing or has been submitted
    if (isProcessing || hasSubmitted) return false;
    if (!orderId || totalAmount <= 0) return false;
    switch (selectedMethod) {
      case 'CC':
        return validateCreditCard();
      case 'AGT':
        return validateAgencyPayment();
      case 'IFG':
        return true; // BSP always available for seller
    }
    return false;
  };

  // Build distribution chain from context
  const buildDistributionChainPayload = () => {
    const config = distributionContext.getPartyConfig();
    if (!config?.participants || config.participants.length === 0) {
      return undefined;
    }

    return {
      links: config.participants.map((p, idx) => ({
        ordinal: idx + 1,
        orgRole: p.role,
        orgName: p.orgName,
        orgId: p.orgCode,
      })),
    };
  };

  // Handle payment submission
  const handleSubmit = async () => {
    // Guard against duplicate submissions
    if (!canSubmit() || isProcessing || hasSubmitted) return;

    setIsProcessing(true);
    setHasSubmitted(true); // Mark as submitted to prevent duplicates
    setError(null);
    setErrorWarnings([]);
    const startTime = Date.now();

    try {
      // Calculate payment amount - include CC fee for credit card payments
      const ccFee = selectedMethod === 'CC' ? (getCurrentCardFee()?.ccSurcharge || 0) : 0;
      const paymentAmount = totalAmount + ccFee;

      let payment: any = {
        amount: {
          value: paymentAmount,
          currency,
        },
      };

      const distributionChain = buildDistributionChainPayload();

      switch (selectedMethod) {
        case 'CC':
          const brand = detectCardBrand(cardForm.cardNumber);
          payment = {
            ...payment,
            type: 'CC',
            card: {
              brand,
              number: cardForm.cardNumber.replace(/\s/g, ''),
              expiryDate: `${cardForm.expiryMonth}/${cardForm.expiryYear}`,
              cvv: cardForm.cvv,
              holderName: cardForm.cardholderName,
            },
          };
          break;

        case 'AGT':
          payment = {
            ...payment,
            type: 'AGT',
            agency: {
              iataNumber: agencyForm.selectedParticipant === 'distributor' ? '2' : '1',
            },
          };
          break;

        case 'IFG':
          payment = {
            ...payment,
            type: 'CA',
          };
          break;
      }

      console.log('[ServicePaymentPage] Submitting payment:', {
        orderId,
        method: selectedMethod,
        baseAmount: totalAmount,
        ccFee: ccFee,
        totalPaymentAmount: paymentAmount,
        currency,
      });

      const response = await processPayment({
        orderId,
        ownerCode: 'JQ',
        payment,
        distributionChain,
      });

      const duration = response.duration || Date.now() - startTime;

      addCapture({
        operation: 'OrderChange (Service Payment)',
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration,
        status: 'success',
        userAction: `Service Payment via ${selectedMethod}`,
      });

      setPaymentResult(response.data);
      setPaidAmount(paymentAmount); // Track amount paid including CC fee
      setSuccess(true);

      console.log('[ServicePaymentPage] Payment successful:', response.data);
    } catch (err: any) {
      console.error('[ServicePaymentPage] Payment error:', err);

      // Extract warnings array if present (for detailed display)
      const warnings: string[] = err.response?.data?.warnings || [];
      setErrorWarnings(warnings);

      // Use first warning as main error message, or fall back to generic message
      let errorMessage: string;
      if (warnings.length > 0) {
        // Use the first warning as the primary error message
        errorMessage = warnings[0];
      } else {
        errorMessage =
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Payment failed';
      }

      if (errorMessage === 'Request failed with status code 400' && err.response?.data) {
        const dataStr = typeof err.response.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response.data);
        errorMessage = `Payment failed: ${dataStr.substring(0, 500)}`;
      }

      setError(errorMessage);

      const errorDuration = Date.now() - startTime;
      const requestXml = err.response?.data?.requestXml || '';
      const responseXml = err.response?.data?.responseXml || err.response?.data?.details || `<error>${errorMessage}</error>`;

      addCapture({
        operation: 'OrderChange (Service Payment)',
        request: requestXml,
        response: typeof responseXml === 'string' ? responseXml : JSON.stringify(responseXml, null, 2),
        duration: errorDuration,
        status: 'error',
        userAction: `Service Payment via ${selectedMethod} (FAILED)`,
      });

      // Reset hasSubmitted on error so user can retry
      setHasSubmitted(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // Success view
  if (success && paymentResult) {
    return (
      <AppLayout title="Payment Complete" backTo="/dashboard">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
            <p className="text-slate-600">Your booking payment has been processed.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
              <p className="text-white/80 text-sm font-medium">Booking Reference</p>
              <p className="text-3xl font-bold text-white tracking-widest">{pnr || 'N/A'}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-600">Order ID</span>
                <span className="font-mono font-medium text-slate-900">{orderId.slice(0, 20)}...</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-600">Payment Method</span>
                <span className="font-medium text-slate-900">
                  {selectedMethod === 'CC' && 'Credit Card'}
                  {selectedMethod === 'AGT' && 'Agency Payment'}
                  {selectedMethod === 'IFG' && 'BSP Payment'}
                </span>
              </div>

              <div className="flex justify-between items-center py-3">
                <span className="text-slate-600">Amount Paid</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(paidAmount || totalAmount, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-8">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">Payment Confirmed</p>
                <p className="text-sm text-emerald-700">
                  Your booking has been updated with the payment confirmation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate(`/manage?pnr=${encodeURIComponent(pnr)}`)}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Plane className="w-4 h-4" />
              View Booking
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Payment form view
  return (
    <AppLayout title={isAddMode ? "Add Payment" : "Complete Payment"} backTo={backTo}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-full mb-4">
            <Wallet className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">Secure Payment</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {isAddMode ? "Add Extra Payment" : "Complete Your Payment"}
          </h1>
          <p className="text-slate-600">
            {isAddMode
              ? "Enter the amount you wish to add to your booking."
              : "Choose your preferred payment method to complete your booking."}
          </p>
        </div>

        {/* PROD Environment Warning */}
        {isProdEnvironment && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-red-900">Payment Not Allowed in PROD</p>
                <p className="text-sm text-red-700 mt-1">
                  You are connected to the <strong>PRODUCTION</strong> environment. Payment processing is disabled in PROD to prevent real financial transactions.
                  Only hold bookings are permitted. Switch to UAT environment to test payments.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Amount Input - Only shown in add mode */}
            {isAddMode && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Payment Amount</h2>

                {/* Info note explaining add payment mode */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900">Adding Extra Payment</p>
                      <p className="text-sm text-blue-700">
                        Your booking is already paid in full. You can add an additional payment here for any extra services or adjustments.
                        Enter the amount you wish to add below.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter Amount ({currency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      {currency === 'AUD' ? '$' : currency}
                    </span>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.00"
                      min="0.01"
                      step="0.01"
                      className="w-full pl-12 pr-4 py-4 text-2xl font-bold border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Enter the additional amount you want to pay for this booking.
                  </p>
                </div>
              </div>
            )}

            {/* Fixed amount note - Only shown in complete mode */}
            {!isAddMode && initialAmount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Payment Required</p>
                    <p className="text-sm text-amber-700">
                      The amount due of <strong>{formatCurrency(initialAmount, currency)}</strong> is based on your booking total from the airline.
                      This amount cannot be changed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Method Selection */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Select Payment Method</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Credit Card */}
                <button
                  onClick={() => setSelectedMethod('CC')}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'CC'
                      ? 'border-orange-500 bg-orange-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'CC' && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <CreditCard
                    className={`w-8 h-8 mb-3 ${selectedMethod === 'CC' ? 'text-orange-600' : 'text-slate-400'}`}
                  />
                  <p className={`font-semibold ${selectedMethod === 'CC' ? 'text-orange-900' : 'text-slate-900'}`}>
                    Credit Card
                  </p>
                  <p className={`text-xs mt-1 ${selectedMethod === 'CC' ? 'text-orange-700' : 'text-slate-500'}`}>
                    Visa, Mastercard, Amex
                  </p>
                </button>

                {/* Agency Payment */}
                <button
                  onClick={() => setSelectedMethod('AGT')}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'AGT'
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'AGT' && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <Building2
                    className={`w-8 h-8 mb-3 ${selectedMethod === 'AGT' ? 'text-blue-600' : 'text-slate-400'}`}
                  />
                  <p className={`font-semibold ${selectedMethod === 'AGT' ? 'text-blue-900' : 'text-slate-900'}`}>
                    Jetstar Agency
                  </p>
                  <p className={`text-xs mt-1 ${selectedMethod === 'AGT' ? 'text-blue-700' : 'text-slate-500'}`}>
                    Agency Account Settlement
                  </p>
                </button>

                {/* BSP Payment */}
                <button
                  onClick={() => setSelectedMethod('IFG')}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'IFG'
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'IFG' && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <Sparkles
                    className={`w-8 h-8 mb-3 ${selectedMethod === 'IFG' ? 'text-purple-600' : 'text-slate-400'}`}
                  />
                  <p className={`font-semibold ${selectedMethod === 'IFG' ? 'text-purple-900' : 'text-slate-900'}`}>
                    BSP Payment
                  </p>
                  <p className={`text-xs mt-1 ${selectedMethod === 'IFG' ? 'text-purple-700' : 'text-slate-500'}`}>
                    IATA BSP Settlement
                  </p>
                </button>
              </div>
            </div>

            {/* Payment Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              {/* Credit Card Form */}
              {selectedMethod === 'CC' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-orange-500" />
                      Card Details
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cardForm.cardNumber === '4444 3333 2222 1111'}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCardForm({
                              cardNumber: '4444 3333 2222 1111',
                              cardholderName: 'TEST CARD',
                              expiryMonth: '03',
                              expiryYear: '30',
                              cvv: '737',
                            });
                          } else {
                            setCardForm({
                              cardNumber: '',
                              cardholderName: '',
                              expiryMonth: '',
                              expiryYear: '',
                              cvv: '',
                            });
                          }
                        }}
                        className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
                      />
                      <span className="text-sm text-slate-600">Use Test Card</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Card Number</label>
                    <input
                      type="text"
                      value={cardForm.cardNumber}
                      onChange={(e) =>
                        setCardForm((prev) => ({
                          ...prev,
                          cardNumber: formatCardNumber(e.target.value.slice(0, 19)),
                        }))
                      }
                      placeholder="4111 1111 1111 1111"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                      maxLength={19}
                    />
                    {cardForm.cardNumber && (
                      <p className="text-xs text-slate-500 mt-1">
                        Detected: {CARD_BRANDS.find((b) => b.code === detectCardBrand(cardForm.cardNumber))?.name || 'Unknown'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Cardholder Name</label>
                    <input
                      type="text"
                      value={cardForm.cardholderName}
                      onChange={(e) =>
                        setCardForm((prev) => ({ ...prev, cardholderName: e.target.value.toUpperCase() }))
                      }
                      placeholder="JOHN SMITH"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Month</label>
                      <input
                        type="text"
                        value={cardForm.expiryMonth}
                        onChange={(e) =>
                          setCardForm((prev) => ({
                            ...prev,
                            expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2),
                          }))
                        }
                        placeholder="MM"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-center font-mono"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Year</label>
                      <input
                        type="text"
                        value={cardForm.expiryYear}
                        onChange={(e) =>
                          setCardForm((prev) => ({
                            ...prev,
                            expiryYear: e.target.value.replace(/\D/g, '').slice(0, 2),
                          }))
                        }
                        placeholder="YY"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-center font-mono"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">CVV</label>
                      <input
                        type="password"
                        value={cardForm.cvv}
                        onChange={(e) =>
                          setCardForm((prev) => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                        }
                        placeholder="***"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-center font-mono"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  {/* CC Fee Display */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Card Surcharge</span>
                      {isLoadingCCFees ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          <span className="text-sm text-slate-500">Calculating...</span>
                        </div>
                      ) : ccFeesError ? (
                        <span className="text-sm text-amber-600">Unable to calculate</span>
                      ) : getCurrentCardFee() ? (
                        <span className="font-semibold text-slate-900">
                          {getCurrentCardFee()!.ccSurcharge > 0
                            ? formatCurrency(getCurrentCardFee()!.ccSurcharge, currency)
                            : 'No surcharge'}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">Enter card number</span>
                      )}
                    </div>
                    {/* Show all card fees for reference */}
                    {ccFees.length > 0 && !isLoadingCCFees && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs text-slate-500 mb-2">Surcharges by card type:</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {ccFees.map((fee) => (
                            <div
                              key={fee.cardBrand}
                              className={`p-2 rounded ${
                                cardForm.cardNumber && detectCardBrand(cardForm.cardNumber) === fee.cardBrand
                                  ? 'bg-orange-100 border border-orange-300'
                                  : 'bg-white border border-slate-200'
                              }`}
                            >
                              <span className="font-medium text-slate-700">
                                {fee.cardBrand === 'VI' ? 'Visa' : fee.cardBrand === 'MC' ? 'MC' : 'Amex'}:
                              </span>{' '}
                              <span className={fee.error ? 'text-red-500' : 'text-slate-900'}>
                                {fee.error ? 'Error' : fee.ccSurcharge > 0 ? formatCurrency(fee.ccSurcharge, currency) : '$0'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Agency Payment Form */}
              {selectedMethod === 'AGT' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-500" />
                    Jetstar Agency Settlement
                  </h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Settlement Account</label>
                    <div className="space-y-3">
                      <label
                        className={`flex items-center gap-3 p-4 border-2 rounded-xl transition-all ${
                          isBOBBooking ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          agencyForm.selectedParticipant === 'seller'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="agtParticipant"
                          value="seller"
                          checked={agencyForm.selectedParticipant === 'seller'}
                          onChange={() => setAgencyForm((prev) => ({ ...prev, selectedParticipant: 'seller' }))}
                          disabled={!isBOBBooking}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">Seller</span>
                            <span className="text-xs text-blue-600 font-mono bg-blue-100 px-2 py-0.5 rounded">IATA #1</span>
                          </div>
                          {sellerInfo && (
                            <p className="text-sm text-slate-600 mt-1">
                              {sellerInfo.orgName} ({sellerInfo.orgCode})
                            </p>
                          )}
                        </div>
                      </label>

                      {isBOBBooking && distributorInfo && (
                        <label
                          className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                            agencyForm.selectedParticipant === 'distributor'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="agtParticipant"
                            value="distributor"
                            checked={agencyForm.selectedParticipant === 'distributor'}
                            onChange={() => setAgencyForm((prev) => ({ ...prev, selectedParticipant: 'distributor' }))}
                            className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">Distributor</span>
                              <span className="text-xs text-blue-600 font-mono bg-blue-100 px-2 py-0.5 rounded">IATA #2</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                              {distributorInfo.orgName} ({distributorInfo.orgCode})
                            </p>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex gap-3">
                      <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-blue-900">Agency Account Settlement</p>
                        <p className="text-sm text-blue-700">
                          Payment will be charged to {agencyForm.selectedParticipant === 'seller' ? 'Seller' : 'Distributor'}'s
                          agency account.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BSP Payment Form */}
              {selectedMethod === 'IFG' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    BSP Payment Details
                  </h3>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Settlement Account</span>
                      <span className="text-sm font-mono text-slate-900">
                        {sellerInfo ? `${sellerInfo.orgName} (${sellerInfo.orgCode})` : 'Seller'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex gap-3">
                      <Shield className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-purple-900">BSP Settlement (Cash Agency)</p>
                        <p className="text-sm text-purple-700">
                          Payment will be processed through IATA BSP settlement.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900">Payment Failed</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                    {/* Show additional warnings if there are more than one */}
                    {errorWarnings.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <p className="text-xs font-medium text-red-800 mb-2">Additional Warnings:</p>
                        <ul className="space-y-1">
                          {errorWarnings.slice(1).map((warning, idx) => (
                            <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">•</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-24">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Payment Summary</h3>

              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Booking Reference</p>
                <p className="text-xl font-bold text-slate-900 font-mono">{pnr || 'N/A'}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Order ID</span>
                  <span className="font-mono text-slate-900">{orderId?.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isAddMode
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isAddMode ? 'Paid - Adding Extra' : 'Awaiting Payment'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{isAddMode ? 'Amount to Add' : 'Base Amount'}</span>
                  <span className="font-medium text-slate-900">
                    {totalAmount > 0 ? formatCurrency(totalAmount, currency) : `${currency} 0.00`}
                  </span>
                </div>

                {/* Show CC fee if credit card selected and fee available */}
                {selectedMethod === 'CC' && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Card Surcharge</span>
                    {isLoadingCCFees ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {getCurrentCardFee()?.ccSurcharge
                          ? formatCurrency(getCurrentCardFee()!.ccSurcharge, currency)
                          : '$0.00'}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="font-semibold text-slate-900">Total to Pay</span>
                  <span className="text-2xl font-bold text-orange-600">
                    {selectedMethod === 'CC'
                      ? formatCurrency(getCurrentCardTotal(), currency)
                      : formatCurrency(totalAmount, currency)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || isProcessing || hasSubmitted || isProdEnvironment}
                className={`w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 font-bold rounded-xl transition-colors ${
                  isProdEnvironment
                    ? 'bg-red-100 text-red-400 cursor-not-allowed border-2 border-red-200'
                    : 'bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : isProdEnvironment ? (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    Payment Disabled in PROD
                  </>
                ) : hasSubmitted ? (
                  <>
                    <Lock className="w-5 h-5" />
                    Payment Submitted
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    {isAddMode ? 'Add Payment' : 'Pay'} {selectedMethod === 'CC'
                      ? formatCurrency(getCurrentCardTotal(), currency)
                      : formatCurrency(totalAmount, currency)}
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Shield className="w-4 h-4" />
                <span>Secure Payment Gateway</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default ServicePaymentPage;
