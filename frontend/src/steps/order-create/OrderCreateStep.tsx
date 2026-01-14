import { useState } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useDistributionContext } from '@/core/context/SessionStore';
import { orderCreate } from '@/lib/ndc-api';
import { annotateXml, type AnnotationContext, buildPassengerContextList } from '@/lib/xml-annotator';
import { Card, Button, Input, Alert, Badge } from '@/components/ui';
import { CreditCard, Lock, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';

interface PaymentForm {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export function OrderCreateStep() {
  const { context, updateContext, nextStep, prevStep } = useWorkflow();
  const distributionContext = useDistributionContext();
  const { addCapture } = useXmlViewer();
  
  const [payment, setPayment] = useState<PaymentForm>({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);

  const detectCardType = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'VI';
    if (/^5[1-5]/.test(cleaned)) return 'MC';
    if (/^3[47]/.test(cleaned)) return 'AX';
    return 'VI';
  };

  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const handleSubmit = async () => {
    // Validate
    if (!payment.cardNumber || !payment.cardholderName || !payment.expiryMonth || !payment.expiryYear || !payment.cvv) {
      setError('Please fill in all payment details');
      return;
    }

    setIsProcessing(true);
    setError(null);
    const startTime = Date.now();

    try {
      // Build distribution chain from distribution context (set in wizard)
      const distributionChain = distributionContext.isValid ? {
        links: distributionContext.getPartyConfig()?.participants.map(p => ({
          ordinal: p.ordinal,
          orgRole: p.role,
          orgId: p.orgCode,
          orgName: p.orgName,
        })) || []
      } : undefined;

      const response = await orderCreate({
        shoppingResponseId: context.shoppingResponseId!,
        offerId: context.selectedOffers![0].offerId,
        offerItemIds: context.selectedOffers![0].offerItemIds || [context.selectedOffers![0].bundleId],
        passengers: context.passengers!,
        contact: context.contact!,
        payment: {
          cardType: detectCardType(payment.cardNumber),
          cardNumber: payment.cardNumber.replace(/\s/g, ''),
          expiryMonth: payment.expiryMonth,
          expiryYear: payment.expiryYear,
          cvv: payment.cvv,
          cardholderName: payment.cardholderName,
        },
        selectedServices: context.selectedServices,
        selectedSeats: context.selectedSeats,
        distributionChain,
      });

      const duration = response.duration || Date.now() - startTime;

      // Build annotation context for OrderCreate
      const annotationCtx: AnnotationContext = {
        operation: 'OrderCreate',
        stepInWorkflow: 'Step 6: Payment & Booking Confirmation',
        flight: {
          origin: context.searchParams?.origin,
          destination: context.searchParams?.destination,
          departureDate: context.searchParams?.departureDate,
          returnDate: context.searchParams?.returnDate,
          passengers: context.searchParams?.passengers,
        },
        outboundOffer: context.selectedOffers?.[0] ? {
          offerId: context.selectedOffers[0].offerId,
          bundleId: context.selectedOffers[0].bundleId,
          bundleName: context.selectedOffers[0].bundleName,
          direction: 'outbound',
        } : undefined,
        passengers: context.passengers ? buildPassengerContextList(context.passengers) : undefined,
        services: context.selectedServices?.map((s: any) => ({
          serviceCode: s.serviceCode,
          serviceName: s.serviceName,
          quantity: s.quantity,
          price: s.price,
          currency: s.currency,
        })),
        shoppingResponseId: context.shoppingResponseId,
        timestamp: new Date(),
        changesSinceLastStep: [
          `Payment: ${detectCardType(payment.cardNumber)} card ending ${payment.cardNumber.slice(-4)}`,
          `Total: ${formatCurrency(context.currentPrice || 0, context.currency || 'AUD')}`,
          context.passengers ? `${context.passengers.length} passenger(s)` : null,
          context.selectedServices?.length ? `${context.selectedServices.length} service(s) selected` : null,
        ].filter(Boolean) as string[],
      };

      const annotatedRequest = annotateXml(response.requestXml || '', annotationCtx);

      addCapture({
        operation: 'OrderCreate',
        request: annotatedRequest,
        response: response.responseXml || '',
        duration,
        status: 'success',
        userAction: 'Completed booking with payment',
      });

      const result = response.data;
      setBookingResult(result);
      
      updateContext({
        orderId: result.orderId || result.OrderID,
        pnr: result.pnr || result.PNR || result.bookingReference,
        bookingStatus: 'CONFIRMED',
      });

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Booking failed';
      const errorDuration = Date.now() - startTime;
      const errorResponseXml = err.response?.data?.xml || `<error>${errorMessage}</error>`;

      setError(errorMessage);

      // Build error annotation context
      const errorAnnotationCtx: AnnotationContext = {
        operation: 'OrderCreate (FAILED)',
        stepInWorkflow: 'Step 6: Payment - Error',
        flight: {
          origin: context.searchParams?.origin,
          destination: context.searchParams?.destination,
          departureDate: context.searchParams?.departureDate,
          returnDate: context.searchParams?.returnDate,
          passengers: context.searchParams?.passengers,
        },
        outboundOffer: context.selectedOffers?.[0] ? {
          offerId: context.selectedOffers[0].offerId,
          bundleId: context.selectedOffers[0].bundleId,
          bundleName: context.selectedOffers[0].bundleName,
          direction: 'outbound',
        } : undefined,
        passengers: context.passengers ? buildPassengerContextList(context.passengers) : undefined,
        shoppingResponseId: context.shoppingResponseId,
        timestamp: new Date(),
        changesSinceLastStep: [
          `ERROR: ${errorMessage}`,
          `Payment attempted: ${detectCardType(payment.cardNumber)} card ending ${payment.cardNumber.slice(-4)}`,
        ],
      };

      const annotatedErrorRequest = annotateXml('', errorAnnotationCtx);

      addCapture({
        operation: 'OrderCreate',
        request: annotatedErrorRequest,
        response: errorResponseXml,
        duration: errorDuration,
        status: 'error',
      });

    } finally {
      setIsProcessing(false);
    }
  };

  // Booking Confirmed View
  if (bookingResult) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Booking Confirmed!</h2>
          <p className="text-neutral-600 mb-6">
            Your booking has been successfully created.
          </p>
          
          <div className="bg-neutral-50 rounded-lg p-6 mb-6">
            <p className="text-sm text-neutral-500 mb-1">Booking Reference (PNR)</p>
            <p className="text-3xl font-bold text-primary-600 tracking-wider">
              {bookingResult.pnr || bookingResult.PNR || bookingResult.bookingReference || 'N/A'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left mb-6">
            <div>
              <p className="text-sm text-neutral-500">Order ID</p>
              <p className="font-medium">{bookingResult.orderId || bookingResult.OrderID || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Paid</p>
              <p className="font-medium">{formatCurrency(context.currentPrice || 0, context.currency || 'AUD')}</p>
            </div>
          </div>

          <Alert variant="info" title="Confirmation Email Sent">
            We've sent your booking confirmation to {context.contact?.email}
          </Alert>
        </Card>

        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            Back to Dashboard
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            Print Confirmation
          </Button>
        </div>
      </div>
    );
  }

  // Payment Form View
  return (
    <div className="space-y-6">
      {/* Order Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">Order Summary</h3>
        
        <div className="space-y-2 text-sm">
          {context.searchParams && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Route</span>
              <span className="font-medium">
                {context.searchParams.origin} → {context.searchParams.destination}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-neutral-600">Passengers</span>
            <span className="font-medium">{context.passengers?.length || 1}</span>
          </div>
          {context.servicesTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Extras</span>
              <span className="font-medium">{formatCurrency(context.servicesTotal, 'AUD')}</span>
            </div>
          )}
          {context.seatsTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-600">Seats</span>
              <span className="font-medium">{formatCurrency(context.seatsTotal, 'AUD')}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary-600">{formatCurrency(context.currentPrice || 0, context.currency || 'AUD')}</span>
          </div>
        </div>
      </Card>

      {/* Payment Form */}
      <Card className="p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary-500" />
          Payment Details
        </h3>

        <div className="space-y-4">
          {/* Card Number */}
          <Input
            label="Card Number"
            value={payment.cardNumber}
            onChange={(e) => setPayment(prev => ({ ...prev, cardNumber: formatCardNumber(e.target.value) }))}
            placeholder="4111 1111 1111 1111"
            maxLength={19}
            leftIcon={<CreditCard className="w-4 h-4" />}
          />

          {/* Cardholder Name */}
          <Input
            label="Cardholder Name"
            value={payment.cardholderName}
            onChange={(e) => setPayment(prev => ({ ...prev, cardholderName: e.target.value.toUpperCase() }))}
            placeholder="JOHN SMITH"
          />

          {/* Expiry & CVV */}
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Month"
              value={payment.expiryMonth}
              onChange={(e) => setPayment(prev => ({ ...prev, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="MM"
              maxLength={2}
            />
            <Input
              label="Year"
              value={payment.expiryYear}
              onChange={(e) => setPayment(prev => ({ ...prev, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="YY"
              maxLength={2}
            />
            <Input
              label="CVV"
              type="password"
              value={payment.cvv}
              onChange={(e) => setPayment(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="123"
              maxLength={4}
              leftIcon={<Lock className="w-4 h-4" />}
            />
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          <Lock className="w-4 h-4" />
          Your payment is secured with 256-bit SSL encryption
        </div>
      </Card>

      {error && (
        <Alert variant="error" title="Payment Failed">
          {error}
        </Alert>
      )}

      {/* Navigation - Fixed footer style to match AppLayout */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleSubmit}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Pay {formatCurrency(context.currentPrice || 0, context.currency || 'AUD')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
