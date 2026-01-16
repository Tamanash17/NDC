import { useState } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useToast } from '@/core/context/ToastContext';
import { orderChange } from '@/lib/ndc-api';
import { Card, Button, Alert, Badge } from '@/components/ui';
import { BookingSummary } from '@/components/booking';
import { XCircle, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

export function OrderCancelStep() {
  const { context, prevStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const toast = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number | null>(null);

  // Mock booking data
  const booking = context.retrievedOrder || {
    pnr: context.pnr || 'ABC123',
    orderId: context.orderId,
    status: 'CONFIRMED' as const,
    flights: [{
      flightNumber: 'JQ001',
      origin: 'SYD',
      destination: 'MEL',
      departureDate: '2025-03-15',
      departureTime: '08:00',
      arrivalTime: '09:30',
    }],
    passengers: [{ title: 'MR', firstName: 'John', lastName: 'Smith', ptc: 'ADT' }],
    pricing: { total: 299, currency: 'AUD' },
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    setError(null);
    const startTime = Date.now();

    try {
      // In a real implementation, this would call OrderCancel
      // For now, we simulate with OrderChange
      const response = await orderChange({
        orderId: context.orderId || '',
        changeType: 'ADD_SERVICE', // Would be CANCEL in real implementation
      });

      // Build route label from booking data
      const origin = booking.flights?.[0]?.origin || 'XXX';
      const destination = booking.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderCancel (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Cancelled booking',
      });

      // Simulate refund calculation (based on fare rules)
      const calculatedRefund = booking.pricing.total * 0.7; // 70% refund
      setRefundAmount(calculatedRefund);
      setCancelled(true);
      toast.success('Booking cancelled', 'Your refund is being processed');

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Cancellation failed';
      setError(errorMessage);
      toast.error('Cancellation failed', errorMessage);
      
      // Build route label from booking data
      const origin = booking.flights?.[0]?.origin || 'XXX';
      const destination = booking.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderCancel (${routeLabel})`,
        request: '',
        response: err.response?.data?.xml || `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Cancelled Success View
  if (cancelled) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Booking Cancelled</h2>
          <p className="text-neutral-600 mb-6">
            Your booking {booking.pnr} has been successfully cancelled.
          </p>
          
          {refundAmount !== null && refundAmount > 0 && (
            <div className="bg-green-50 rounded-lg p-6 mb-6">
              <p className="text-sm text-neutral-500 mb-1">Refund Amount</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(refundAmount, booking.pricing.currency)}
              </p>
              <p className="text-sm text-neutral-500 mt-2">
                Refund will be processed within 5-10 business days
              </p>
            </div>
          )}

          <Alert variant="info" title="Confirmation Email Sent">
            We've sent your cancellation confirmation to {context.contact?.email || 'your email'}
          </Alert>
        </Card>

        <div className="flex justify-center">
          <Button variant="primary" onClick={() => window.location.href = '/dashboard'}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Confirmation View
  return (
    <div className="space-y-6">
      {/* Warning */}
      <Alert variant="warning" title="Are you sure you want to cancel?">
        This action cannot be undone. Cancellation fees may apply based on fare rules.
      </Alert>

      {/* Booking Summary */}
      <BookingSummary booking={booking} />

      {/* Cancellation Policy */}
      <Card className="p-6">
        <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Cancellation Policy
        </h3>
        
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600">Original Amount</span>
            <span className="font-medium">{formatCurrency(booking.pricing.total, booking.pricing.currency)}</span>
          </div>
          <div className="flex justify-between text-amber-600">
            <span>Cancellation Fee (30%)</span>
            <span>-{formatCurrency(booking.pricing.total * 0.3, booking.pricing.currency)}</span>
          </div>
          <div className="border-t pt-3 flex justify-between font-bold">
            <span>Estimated Refund</span>
            <span className="text-green-600">{formatCurrency(booking.pricing.total * 0.7, booking.pricing.currency)}</span>
          </div>
        </div>

        <p className="text-xs text-neutral-500 mt-4">
          * Actual refund amount may vary based on fare rules and timing of cancellation.
          Non-refundable components (e.g., some add-ons) may not be eligible for refund.
        </p>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="error" title="Cancellation Failed">
          {error}
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep} disabled={isProcessing}>
          Keep Booking
        </Button>
        <Button
          variant="error"
          size="lg"
          onClick={handleCancel}
          isLoading={isProcessing}
          leftIcon={!isProcessing && <XCircle className="w-5 h-5" />}
        >
          {isProcessing ? 'Cancelling...' : 'Confirm Cancellation'}
        </Button>
      </div>
    </div>
  );
}
