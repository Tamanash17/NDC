import { useState } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useToast } from '@/core/context/ToastContext';
import { orderChange } from '@/lib/ndc-api';
import { Card, Button, Input, Alert, Badge } from '@/components/ui';
import { CheckCircle, CreditCard, Lock, Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface PaymentForm {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}

export function OrderChangeStep() {
  const { context, updateContext, prevStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const toast = useToast();
  
  const [payment, setPayment] = useState<PaymentForm>({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<any>(null);

  const priceDifference = context.priceDifference || 0;
  const needsPayment = priceDifference > 0;
  const isCredit = priceDifference < 0;
  const currency = context.currency || 'AUD';

  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const detectCardType = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'VI';
    if (/^5[1-5]/.test(cleaned)) return 'MC';
    if (/^3[47]/.test(cleaned)) return 'AX';
    return 'VI';
  };

  const handleSubmit = async () => {
    if (needsPayment) {
      if (!payment.cardNumber || !payment.cardholderName || !payment.expiryMonth || !payment.expiryYear || !payment.cvv) {
        setError('Please fill in all payment details');
        return;
      }
    }

    setIsProcessing(true);
    setError(null);
    const startTime = Date.now();

    try {
      const response = await orderChange({
        orderId: context.orderId || '',
        changeType: needsPayment ? 'ADD_PAYMENT' : 'CHANGE_FLIGHT',
        payment: needsPayment ? {
          cardType: detectCardType(payment.cardNumber),
          cardNumber: payment.cardNumber.replace(/\s/g, ''),
          expiryMonth: payment.expiryMonth,
          expiryYear: payment.expiryYear,
          cvv: payment.cvv,
          cardholderName: payment.cardholderName,
        } : undefined,
      });

      // Build route label from context (order management flow)
      const origin = context.searchParams?.origin || context.retrievedOrder?.flights?.[0]?.origin || 'XXX';
      const destination = context.searchParams?.destination || context.retrievedOrder?.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderChange (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Confirmed booking changes',
      });

      setChangeResult(response.data);
      toast.success('Change confirmed!', 'Your booking has been updated');

      updateContext({
        changeConfirmed: true,
        updatedOrderId: response.data.orderId,
        updatedPnr: response.data.pnr,
      });

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Change failed';
      setError(errorMessage);
      toast.error('Change failed', errorMessage);
      
      // Build route label from context (order management flow)
      const origin = context.searchParams?.origin || context.retrievedOrder?.flights?.[0]?.origin || 'XXX';
      const destination = context.searchParams?.destination || context.retrievedOrder?.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderChange (${routeLabel})`,
        request: '',
        response: err.response?.data?.xml || `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Success View
  if (changeResult) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Change Confirmed!</h2>
          <p className="text-neutral-600 mb-6">
            Your booking has been successfully updated.
          </p>
          
          <div className="bg-neutral-50 rounded-lg p-6 mb-6">
            <p className="text-sm text-neutral-500 mb-1">Updated Booking Reference</p>
            <p className="text-3xl font-bold text-primary-600 tracking-wider">
              {changeResult.pnr || changeResult.PNR || context.pnr}
            </p>
          </div>

          {isCredit && (
            <Alert variant="success" title="Credit Applied">
              A credit of {formatCurrency(Math.abs(priceDifference), currency)} has been applied to your account.
            </Alert>
          )}

          <Alert variant="info" title="Confirmation Email Sent" className="mt-4">
            We've sent your updated itinerary to {context.contact?.email || 'your email'}
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

  // Payment/Confirmation View
  return (
    <div className="space-y-6">
      {/* Change Summary */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <CheckCircle className="w-6 h-6 text-primary-500" />
          Confirm Your Change
        </h2>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600">Change Type</span>
            <span className="font-medium">
              {context.reshopType === 'DATE_CHANGE' ? 'Date Change' : 'Flight Change'}
            </span>
          </div>
          {context.newDepartureDate && (
            <div className="flex justify-between">
              <span className="text-neutral-600">New Date</span>
              <span className="font-medium">{context.newDepartureDate}</span>
            </div>
          )}
          <div className="border-t pt-3 flex justify-between font-bold">
            <span>{needsPayment ? 'Amount Due' : isCredit ? 'Credit Amount' : 'Price Difference'}</span>
            <span className={needsPayment ? 'text-amber-600' : isCredit ? 'text-green-600' : 'text-neutral-600'}>
              {needsPayment ? '+' : isCredit ? '-' : ''}{formatCurrency(Math.abs(priceDifference), currency)}
            </span>
          </div>
        </div>
      </Card>

      {/* Payment Form (if needed) */}
      {needsPayment && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-500" />
            Payment Details
          </h3>

          <div className="space-y-4">
            <Input
              label="Card Number"
              value={payment.cardNumber}
              onChange={(e) => setPayment(prev => ({ ...prev, cardNumber: formatCardNumber(e.target.value) }))}
              placeholder="4111 1111 1111 1111"
              maxLength={19}
              leftIcon={<CreditCard className="w-4 h-4" />}
            />

            <Input
              label="Cardholder Name"
              value={payment.cardholderName}
              onChange={(e) => setPayment(prev => ({ ...prev, cardholderName: e.target.value.toUpperCase() }))}
              placeholder="JOHN SMITH"
            />

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

          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
            <Lock className="w-4 h-4" />
            Your payment is secured with 256-bit SSL encryption
          </div>
        </Card>
      )}

      {/* Credit Notice */}
      {isCredit && (
        <Alert variant="success" title="Credit to Account">
          A credit of {formatCurrency(Math.abs(priceDifference), currency)} will be applied to your account
          after confirming this change.
        </Alert>
      )}

      {/* No Change Notice */}
      {priceDifference === 0 && (
        <Alert variant="info" title="No Payment Required">
          Your change is fare-neutral. Click confirm to complete your booking change.
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert variant="error" title="Change Failed">
          {error}
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep} disabled={isProcessing}>
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          isLoading={isProcessing}
          leftIcon={!isProcessing && (needsPayment ? <Lock className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />)}
        >
          {isProcessing 
            ? 'Processing...' 
            : needsPayment 
            ? `Pay ${formatCurrency(priceDifference, currency)}` 
            : 'Confirm Change'
          }
        </Button>
      </div>
    </div>
  );
}
