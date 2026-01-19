import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';
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
  ArrowRight,
  ArrowLeft,
  Loader2,
  Shield,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Plane,
  Users,
  Calendar,
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
  selectedParticipant: 'seller' | 'distributor';  // Which participant to bill (IATA_Number 1 or 2)
}

interface IFGPaymentForm {
  selectedParticipant: 'seller' | 'distributor';  // Which participant to use for IATA_Number
  referenceNumber: string;
}

export function PaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const flightStore = useFlightSelectionStore();
  const distributionContext = useDistributionContext();
  const { addCapture } = useXmlViewer();
  const { environment } = useSession();

  // Check if we're in PROD environment - payment is not allowed in PROD
  const isProdEnvironment = environment === 'PROD';

  // Get booking details from URL params or store
  const orderId = searchParams.get('orderId') || flightStore.orderId;
  const pnr = searchParams.get('pnr') || flightStore.pnr;
  const totalAmount = parseFloat(searchParams.get('amount') || '0') || flightStore.totalAmount || 0;
  const currency = searchParams.get('currency') || flightStore.currency || 'AUD';

  // Back navigation always goes to booking page for prime flow
  const backTo = '/booking';

  // State
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CC');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false); // Prevent duplicate submissions
  const [error, setError] = useState<string | null>(null);
  const [errorWarnings, setErrorWarnings] = useState<string[]>([]); // Separate warnings for detailed display
  const [success, setSuccess] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0); // Track actual amount paid (including CC fee)

  // CC fees state
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
    selectedParticipant: 'seller',  // Default to seller (IATA_Number = 1)
  });

  const [ifgForm, setIFGForm] = useState<IFGPaymentForm>({
    selectedParticipant: 'seller',  // Default to seller (IATA_Number = 1)
    referenceNumber: '',
  });

  // Check if this is a BOB booking (has distributor in distribution chain)
  const isBOBBooking = distributionContext.isValid &&
    (distributionContext.getPartyConfig()?.participants?.length || 0) > 1;

  // Get participant details for display
  const sellerInfo = distributionContext.seller;
  const distributorInfo = distributionContext.getPartyConfig()?.participants?.find(p => p.role === 'Distributor');

  // Fetch CC fees using OrderRetrieve + Long Sell
  // This approach uses the created order to get accurate CC fees
  const fetchCCFeesNow = async () => {
    // Get order ID from URL params or flight store
    const orderIdFromUrl = searchParams.get('orderId');
    const orderIdFromStore = flightStore.orderId;
    const orderId = orderIdFromUrl || orderIdFromStore;

    if (!orderId) {
      console.log('[PaymentPage] No order ID available, skipping CC fee fetch');
      setCCFeesError('No order ID available for CC fee calculation');
      return;
    }

    setIsLoadingCCFees(true);
    setCCFeesError(null);

    try {
      console.log('[PaymentPage] Fetching CC fees for order:', orderId);

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

      console.log('[PaymentPage] CC fees fetched:', response.fees);

      // Add to XML Logs panel
      const visaFee = response.fees.find(f => f.cardBrand === 'VI');
      if (visaFee && visaFee.requestXml) {
        addCapture({
          operation: 'CCFees (OrderRetrieve + LongSell)',
          request: visaFee.requestXml || '',
          response: visaFee.rawResponse || '',
          duration,
          status: visaFee.error ? 'error' : 'success',
          userAction: `Fetched CC fees for order ${orderId}: Visa=${visaFee.ccSurcharge > 0 ? `$${visaFee.ccSurcharge.toFixed(2)}` : 'No fee'}`,
        });
      }
    } catch (err: any) {
      console.error('[PaymentPage] Error fetching CC fees:', err);
      setCCFeesError(err.message || 'Failed to fetch CC fees');
    } finally {
      setIsLoadingCCFees(false);
    }
  };

  // Auto-fetch CC fees when order ID is available
  useEffect(() => {
    const orderIdFromUrl = searchParams.get('orderId');
    const orderIdFromStore = flightStore.orderId;
    const orderId = orderIdFromUrl || orderIdFromStore;

    if (orderId) {
      fetchCCFeesNow();
    }
  }, [searchParams, flightStore.orderId, currency]);

  // Get CC fee for currently detected card brand
  const getCurrentCardFee = (): CCFeeResult | null => {
    if (ccFees.length === 0 || !cardForm.cardNumber) return null;
    const brand = detectCardBrand(cardForm.cardNumber);
    // Map brand codes (VI -> VI, MC -> MC, AX -> AX, JC -> JCB)
    const brandMapping: Record<string, string> = { 'VI': 'VI', 'MC': 'MC', 'AX': 'AX', 'JC': 'JCB', 'DC': 'VI', 'UP': 'VI' };
    const mappedBrand = brandMapping[brand] || 'VI';
    return ccFees.find(f => f.cardBrand === mappedBrand) || null;
  };

  // Detect card brand
  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    for (const brand of CARD_BRANDS) {
      if (brand.pattern.test(cleaned)) {
        return brand.code;
      }
    }
    return 'VI'; // Default to Visa
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
    // Need valid participant selected (distributor only for BOB bookings)
    // No account number required - uses IATA_Number from distribution chain
    return agencyForm.selectedParticipant === 'seller' ||
      (agencyForm.selectedParticipant === 'distributor' && isBOBBooking);
  };

  const validateIFGPayment = (): boolean => {
    // Just need a participant selected - seller is always available
    return ifgForm.selectedParticipant === 'seller' ||
      (ifgForm.selectedParticipant === 'distributor' && isBOBBooking);
  };

  const canSubmit = (): boolean => {
    // Prevent submission if already processing or has been submitted
    if (isProcessing || hasSubmitted) return false;
    if (!orderId) return false;
    // For CC payments, wait until fees are loaded
    if (selectedMethod === 'CC' && isLoadingCCFees) return false;
    switch (selectedMethod) {
      case 'CC':
        return validateCreditCard();
      case 'AGT':
        return validateAgencyPayment();
      case 'IFG':
        return validateIFGPayment();
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
      // Calculate total payment amount including CC fee
      let paymentTotal = totalAmount;
      if (selectedMethod === 'CC') {
        const currentFee = getCurrentCardFee();
        if (currentFee && currentFee.ccSurcharge > 0) {
          paymentTotal = totalAmount + currentFee.ccSurcharge;
          console.log('[PaymentPage] CC fee applied:', {
            baseAmount: totalAmount,
            ccFee: currentFee.ccSurcharge,
            totalPayment: paymentTotal,
            cardBrand: detectCardBrand(cardForm.cardNumber),
          });
        }
      }

      // Build base payment request with total (including CC fee for card payments)
      let payment: any = {
        amount: {
          value: paymentTotal,
          currency,
        },
      };

      // Build distribution chain
      const distributionChain = buildDistributionChainPayload();

      // Add payment method specific fields
      switch (selectedMethod) {
        case 'CC':
          // Get the detected card brand
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
          // IATA_Number: 1 = Seller, 2 = Distributor (per Postman AG flow)
          // For direct bookings (non-BOB), always use 1 (Seller)
          // For BOB bookings, use selected participant ordinal
          payment = {
            ...payment,
            type: 'AGT',
            agency: {
              iataNumber: agencyForm.selectedParticipant === 'distributor' ? '2' : '1',
            },
          };
          break;

        case 'IFG':
          // IFG uses CA payment type (Cash Agency) - NO IATA_Number per Postman
          // Settlement is determined by Seller OrgID in distribution chain
          payment = {
            ...payment,
            type: 'CA',  // Cash Agency payment type
          };
          break;
      }

      console.log('[PaymentPage] Submitting payment:', {
        orderId,
        method: selectedMethod,
        amount: totalAmount,
        currency,
      });

      // Call Process Payment API
      const response = await processPayment({
        orderId,
        ownerCode: 'JQ',
        payment,
        distributionChain,
      });

      const duration = response.duration || Date.now() - startTime;

      // Add to XML viewer
      addCapture({
        operation: 'OrderChange (Payment)',
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration,
        status: 'success',
        userAction: `Payment via ${selectedMethod}`,
      });

      setPaymentResult(response.data);
      setPaidAmount(paymentTotal); // Store actual amount paid
      setSuccess(true);

      console.log('[PaymentPage] Payment successful:', response.data);
    } catch (err: any) {
      // Backend returns { success: false, error: "Error message string", warnings: string[] }
      // Log entire error response for debugging
      console.error('[PaymentPage] Full error object:', err);
      console.error('[PaymentPage] err.response:', err.response);
      console.error('[PaymentPage] err.response?.data:', err.response?.data);

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

      // If we still have generic message, try to get more details
      if (errorMessage === 'Request failed with status code 400' && err.response?.data) {
        // Try to stringify the entire response data for debugging
        const dataStr = typeof err.response.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response.data);
        errorMessage = `Payment failed: ${dataStr.substring(0, 500)}`;
      }

      setError(errorMessage);

      console.error('[PaymentPage] Payment error details:', {
        status: err.response?.status,
        data: err.response?.data,
        message: errorMessage,
      });

      const errorDuration = Date.now() - startTime;

      // Capture request and response XML from error response
      const requestXml = err.response?.data?.requestXml || '';
      const responseXml = err.response?.data?.responseXml || err.response?.data?.details || `<error>${errorMessage}</error>`;

      addCapture({
        operation: 'OrderChange (Payment)',
        request: requestXml,
        response: typeof responseXml === 'string' ? responseXml : JSON.stringify(responseXml, null, 2),
        duration: errorDuration,
        status: 'error',
        userAction: `Payment via ${selectedMethod} (FAILED)`,
      });

      console.error('[PaymentPage] Payment error:', err);
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
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
            <p className="text-slate-600">Your booking has been confirmed and paid.</p>
          </div>

          {/* Booking Details Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
              <p className="text-white/80 text-sm font-medium">Booking Reference</p>
              <p className="text-3xl font-bold text-white tracking-widest">{pnr || 'N/A'}</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-600">Order ID</span>
                <span className="font-mono font-medium text-slate-900">{orderId}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-600">Payment Method</span>
                <span className="font-medium text-slate-900">
                  {selectedMethod === 'CC' && 'Credit Card'}
                  {selectedMethod === 'AGT' && 'Agency Payment'}
                  {selectedMethod === 'IFG' && 'IFG Payment'}
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

          {/* Confirmation Message */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-8">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">Confirmation email sent</p>
                <p className="text-sm text-emerald-700">
                  A confirmation email with your itinerary has been sent to your registered email address.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate(`/manage?pnr=${encodeURIComponent(pnr || '')}`)}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Plane className="w-4 h-4" />
              Retrieve PNR
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Payment form view
  return (
    <AppLayout title="Complete Payment" backTo={backTo}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-full mb-4">
            <Wallet className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-700">Secure Payment</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Complete Your Booking</h1>
          <p className="text-slate-600">Choose your preferred payment method to finalize your reservation.</p>
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
          {/* Payment Methods */}
          <div className="lg:col-span-2 space-y-6">
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

                {/* Jetstar Agency Payment */}
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
                    {/* Use Test Card Checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cardForm.cardNumber === '4444 3333 2222 1111'}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Populate with test card data
                            setCardForm({
                              cardNumber: '4444 3333 2222 1111',
                              cardholderName: 'TEST CARD',
                              expiryMonth: '03',
                              expiryYear: '30',
                              cvv: '737',
                            });
                          } else {
                            // Clear form
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
                    {cardForm.cardNumber && (() => {
                      const brand = detectCardBrand(cardForm.cardNumber);
                      const brandInfo = CARD_BRANDS.find((b) => b.code === brand);
                      return (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
                            <span className="font-mono font-bold text-slate-700 text-sm">{brand}</span>
                            <span className="text-slate-400 mx-1.5">|</span>
                            <span className="text-slate-600 text-sm">{brandInfo?.name || 'Unknown'}</span>
                          </span>
                        </div>
                      );
                    })()}
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

                  {/* CC Surcharge Display - Shows fee for currently detected card */}
                  {isLoadingCCFees && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                        <span className="text-sm text-slate-600">Loading card surcharges...</span>
                      </div>
                    </div>
                  )}

                  {!isLoadingCCFees && ccFees.length > 0 && (() => {
                    // Get current card's fee
                    const currentFee = getCurrentCardFee();
                    const detectedBrand = cardForm.cardNumber ? detectCardBrand(cardForm.cardNumber) : null;

                    // Format amount with symbol ($, €) if available, otherwise use currency code
                    const formatSurchargeAmount = (amount: number) => {
                      const currenciesWithSymbols = ['AUD', 'USD', 'NZD', 'SGD', 'CAD', 'HKD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'THB'];
                      if (currenciesWithSymbols.includes(currency)) {
                        return formatCurrency(amount, currency);
                      }
                      return `${currency} ${amount.toFixed(2)}`;
                    };

                    // Calculate percentage
                    const calculatePercentage = (fee: number) => {
                      if (totalAmount <= 0) return '0.00';
                      return ((fee / totalAmount) * 100).toFixed(2);
                    };

                    // If user has entered a card number, show specific fee for that card
                    if (detectedBrand && currentFee && currentFee.ccSurcharge > 0) {
                      const brandName = CARD_BRANDS.find(b => b.code === detectedBrand)?.name || detectedBrand;
                      const pct = calculatePercentage(currentFee.ccSurcharge);

                      return (
                        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <CreditCard className="w-5 h-5 text-orange-600 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-orange-900">{brandName} Surcharge</span>
                                <span className="text-lg font-bold text-orange-700">
                                  {formatSurchargeAmount(currentFee.ccSurcharge)}
                                </span>
                              </div>
                              <div className="text-sm text-orange-600">
                                {pct}% of booking total
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // No card entered yet - show summary of all card surcharges
                    const displayFees = ccFees.filter(f => ['VI', 'MC', 'AX'].includes(f.cardBrand));
                    const validFees = displayFees.filter(f => !f.error && f.ccSurcharge > 0);
                    const uniqueAmounts = new Set(validFees.map(f => f.ccSurcharge));
                    const isFixedAmount = uniqueAmounts.size === 1 && validFees.length > 1;

                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <Info className="w-5 h-5 text-amber-600 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-amber-900">Card Surcharges</span>
                              {isFixedAmount && validFees.length > 0 ? (
                                <span className="text-sm text-amber-800">
                                  <span className="font-mono font-semibold">{formatSurchargeAmount(validFees[0].ccSurcharge)}</span>
                                  <span className="text-amber-600 ml-1">(Fixed)</span>
                                </span>
                              ) : validFees.length > 0 ? (
                                <span className="text-sm text-amber-800">
                                  {displayFees.map((fee, idx) => {
                                    const brandName = fee.cardBrand === 'VI' ? 'Visa' :
                                                     fee.cardBrand === 'MC' ? 'MC' :
                                                     fee.cardBrand === 'AX' ? 'Amex' : fee.cardBrand;
                                    const pct = fee.ccSurcharge > 0 ? calculatePercentage(fee.ccSurcharge) : '0.00';
                                    return (
                                      <span key={fee.cardBrand}>
                                        {idx > 0 && <span className="mx-1 text-amber-400">|</span>}
                                        <span className="text-amber-700">{brandName}</span>
                                        <span className="font-mono font-semibold ml-1">{pct}%</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              ) : (
                                <span className="text-sm text-emerald-700">No surcharge</span>
                              )}
                            </div>
                            <p className="text-xs text-amber-600 mt-1">Enter card number to see applicable fee</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {ccFeesError && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <AlertCircle className="w-4 h-4" />
                        <span>Unable to load card surcharges: {ccFeesError}</span>
                      </div>
                    </div>
                  )}

                  {!isLoadingCCFees && !ccFeesError && ccFees.length === 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Info className="w-4 h-4" />
                        <span>Card surcharges not available for this booking</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Jetstar Agency Payment Form */}
              {selectedMethod === 'AGT' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-500" />
                    Jetstar Agency Settlement
                  </h3>

                  {/* Settlement Party Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Settlement Account</label>
                    <div className="space-y-3">
                      {/* Seller Option - Always available */}
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

                      {/* Distributor Option - Only for BOB bookings */}
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
                          agency account ({agencyForm.selectedParticipant === 'seller' ? sellerInfo?.orgName : distributorInfo?.orgName}).
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">Account Configuration Required</p>
                        <p className="text-sm text-amber-700">
                          This payment method is subject to your agency account configuration with Jetstar.
                          Ensure your IATA number and settlement account are properly configured before processing.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BSP/IFG Payment Form */}
              {selectedMethod === 'IFG' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    BSP Payment Details
                  </h3>

                  {/* Settlement Info - CA payment uses Seller from Distribution Chain */}
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
                          Payment will be processed through IATA BSP settlement. Settlement is automatically linked to the Seller's account from the distribution chain.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">Account Configuration Required</p>
                        <p className="text-sm text-amber-700">
                          This payment method is subject to your BSP/IFG account configuration with Jetstar.
                          Ensure your seller account is properly configured with valid settlement details before processing.
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
              <h3 className="text-lg font-bold text-slate-900 mb-4">Booking Summary</h3>

              {/* Booking Reference */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Booking Reference</p>
                <p className="text-xl font-bold text-slate-900 font-mono">{pnr || 'Pending'}</p>
              </div>

              {/* Order Details */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Order ID</span>
                  <span className="font-mono text-slate-900">{orderId?.slice(0, 20)}...</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                    Awaiting Payment
                  </span>
                </div>
              </div>

              {/* Total with CC Fee breakdown */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                {/* Base Amount */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Booking Total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totalAmount, currency)}</span>
                </div>

                {/* CC Fee - only show if card payment and fee detected */}
                {selectedMethod === 'CC' && (() => {
                  const currentFee = getCurrentCardFee();
                  const detectedBrand = cardForm.cardNumber ? detectCardBrand(cardForm.cardNumber) : null;
                  const brandInfo = detectedBrand ? CARD_BRANDS.find(b => b.code === detectedBrand) : null;

                  if (currentFee && currentFee.ccSurcharge > 0) {
                    return (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 flex items-center gap-1">
                          Card Fee
                          <span className="text-xs text-slate-400">({brandInfo?.name || detectedBrand})</span>
                        </span>
                        <span className="font-semibold text-orange-600">+ {formatCurrency(currentFee.ccSurcharge, currency)}</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Total Due */}
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
                  <span className="font-semibold text-slate-700">Total Due</span>
                  <span className="text-2xl font-bold text-orange-600">
                    {(() => {
                      if (selectedMethod === 'CC') {
                        const currentFee = getCurrentCardFee();
                        const fee = (currentFee && currentFee.ccSurcharge > 0) ? currentFee.ccSurcharge : 0;
                        return formatCurrency(totalAmount + fee, currency);
                      }
                      return formatCurrency(totalAmount, currency);
                    })()}
                  </span>
                </div>
              </div>

              {/* Pay Button */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit() || isProcessing || hasSubmitted || isProdEnvironment || (selectedMethod === 'CC' && isLoadingCCFees)}
                className={`w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 font-bold rounded-xl transition-colors ${
                  isProdEnvironment
                    ? 'bg-red-100 text-red-400 cursor-not-allowed border-2 border-red-200'
                    : 'bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing Payment...
                  </>
                ) : selectedMethod === 'CC' && isLoadingCCFees ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading Fees...
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
                    Pay {(() => {
                      if (selectedMethod === 'CC') {
                        const currentFee = getCurrentCardFee();
                        const fee = (currentFee && currentFee.ccSurcharge > 0) ? currentFee.ccSurcharge : 0;
                        return formatCurrency(totalAmount + fee, currency);
                      }
                      return formatCurrency(totalAmount, currency);
                    })()}
                  </>
                )}
              </button>

              {/* Security Badge */}
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

export default PaymentPage;
