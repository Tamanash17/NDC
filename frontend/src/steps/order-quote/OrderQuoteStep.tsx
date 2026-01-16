import { useState, useEffect } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useToast } from '@/core/context/ToastContext';
import { offerPrice } from '@/lib/ndc-api';
import { Card, Button, Alert, Badge } from '@/components/ui';
import { PriceComparisonPanel } from '@/components/pricing';
import { Calculator, TrendingUp, TrendingDown, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { parseOfferPriceResponse, createPriceSnapshot } from '@/lib/parsers';

export function OrderQuoteStep() {
  const { context, updateContext, nextStep, prevStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const toast = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);

  useEffect(() => {
    fetchQuote();
  }, []);

  const fetchQuote = async () => {
    if (!context.reshopResponseId || !context.selectedReshopOffer) {
      setError('Missing reshop data');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      const response = await offerPrice({
        shoppingResponseId: context.reshopResponseId,
        selectedOffers: [{
          offerId: context.selectedReshopOffer.offerId,
          offerItemIds: [context.selectedReshopOffer.bundleId],
        }],
      });

      const duration = response.duration || Date.now() - startTime;

      // Build route label from context (order management flow)
      const origin = context.searchParams?.origin || context.retrievedOrder?.flights?.[0]?.origin || 'XXX';
      const destination = context.searchParams?.destination || context.retrievedOrder?.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OfferPrice Quote (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration,
        status: 'success',
        userAction: 'Got price quote for booking change',
      });

      const parsed = parseOfferPriceResponse(response.data);
      setQuoteData(parsed);

      // Calculate price difference
      const originalPrice = context.currentPrice || 0;
      const newPrice = parsed.totalAmount;
      const difference = newPrice - originalPrice;

      updateContext({
        quotedPrice: newPrice,
        priceDifference: difference,
        changeSnapshot: createPriceSnapshot('Change Quote', parsed),
      });

      if (difference > 0) {
        toast.info('Additional payment required', `Fare difference: ${formatCurrency(difference, parsed.currency)}`);
      } else if (difference < 0) {
        toast.success('Credit available', `You'll receive a credit of ${formatCurrency(Math.abs(difference), parsed.currency)}`);
      }

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Quote failed';
      const errorDuration = Date.now() - startTime;
      const errorResponseXml = err.response?.data?.xml || `<error>${errorMessage}</error>`;

      setError(errorMessage);
      toast.error('Quote failed', errorMessage);

      // Build route label from context (order management flow)
      const origin = context.searchParams?.origin || context.retrievedOrder?.flights?.[0]?.origin || 'XXX';
      const destination = context.searchParams?.destination || context.retrievedOrder?.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OfferPrice Quote (${routeLabel})`,
        request: '',
        response: errorResponseXml,
        duration: errorDuration,
        status: 'error',
      });

    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    nextStep();
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-neutral-600">Calculating price difference...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="Quote Failed">
          {error}
        </Alert>
        <div className="flex gap-3">
          <Button variant="outline" onClick={prevStep}>Go Back</Button>
          <Button variant="primary" onClick={fetchQuote}>Retry</Button>
        </div>

      </div>
    );
  }

  const originalPrice = context.currentPrice || 0;
  const newPrice = quoteData?.totalAmount || 0;
  const difference = newPrice - originalPrice;
  const isCredit = difference < 0;
  const currency = quoteData?.currency || 'AUD';

  return (
    <div className="space-y-6">
      {/* Quote Summary */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-primary-500" />
          Change Quote
        </h2>

        {/* Price Comparison */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Original Price */}
          <div className="p-4 bg-neutral-50 rounded-lg text-center">
            <p className="text-sm text-neutral-500 mb-1">Original Booking</p>
            <p className="text-xl font-bold text-neutral-700">
              {formatCurrency(originalPrice, currency)}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <ArrowRight className="w-8 h-8 text-neutral-400" />
          </div>

          {/* New Price */}
          <div className="p-4 bg-primary-50 rounded-lg text-center">
            <p className="text-sm text-neutral-500 mb-1">New Booking</p>
            <p className="text-xl font-bold text-primary-600">
              {formatCurrency(newPrice, currency)}
            </p>
          </div>
        </div>

        {/* Difference */}
        <div className={`p-4 rounded-lg ${isCredit ? 'bg-green-50 border border-green-200' : difference > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-neutral-50 border border-neutral-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isCredit ? (
                <TrendingDown className="w-6 h-6 text-green-500" />
              ) : difference > 0 ? (
                <TrendingUp className="w-6 h-6 text-amber-500" />
              ) : (
                <CheckCircle className="w-6 h-6 text-green-500" />
              )}
              <div>
                <p className="font-semibold text-neutral-900">
                  {isCredit ? 'Credit to your account' : difference > 0 ? 'Additional payment required' : 'No price difference'}
                </p>
                <p className="text-sm text-neutral-500">
                  {isCredit 
                    ? 'This credit can be used for future bookings'
                    : difference > 0 
                    ? 'Pay the difference to complete your change'
                    : 'Your change is the same price'
                  }
                </p>
              </div>
            </div>
            <p className={`text-2xl font-bold ${isCredit ? 'text-green-600' : difference > 0 ? 'text-amber-600' : 'text-neutral-600'}`}>
              {isCredit ? '-' : difference > 0 ? '+' : ''}{formatCurrency(Math.abs(difference), currency)}
            </p>
          </div>
        </div>
      </Card>

      {/* Change Details */}
      <Card className="p-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Change Details</h3>
        
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
          <div className="flex justify-between">
            <span className="text-neutral-600">Order ID</span>
            <span className="font-medium">{context.orderId || 'N/A'}</span>
          </div>
        </div>
      </Card>

      {/* Price Breakdown */}
      {quoteData?.breakdown && (
        <Card className="p-6">
          <h3 className="font-semibold text-neutral-900 mb-4">New Fare Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Base Fare</span>
              <span>{formatCurrency(quoteData.breakdown.base, currency)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Taxes & Fees</span>
              <span>{formatCurrency(quoteData.breakdown.taxes + quoteData.breakdown.fees, currency)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary-600">{formatCurrency(newPrice, currency)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Terms */}
      <Alert variant="info" title="Change Terms">
        <ul className="text-sm space-y-1 mt-2">
          <li>• Changes are subject to availability</li>
          <li>• Original fare rules still apply</li>
          <li>• Credits are valid for 12 months</li>
        </ul>
      </Alert>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {difference > 0 ? 'Continue to Payment' : 'Confirm Change'}
        </Button>
      </div>
    </div>
  );
}
