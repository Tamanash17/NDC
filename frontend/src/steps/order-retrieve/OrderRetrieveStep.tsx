import { useState } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { orderRetrieve } from '@/lib/ndc-api';
import { Card, Button, Input, Alert, Badge } from '@/components/ui';
import { Search, Plane, User, Calendar, Loader2, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';

export function OrderRetrieveStep() {
  const { context, updateContext, nextStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  
  const [searchType, setSearchType] = useState<'pnr' | 'orderId'>('pnr');
  const [pnr, setPnr] = useState('');
  const [orderId, setOrderId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<any>(null);

  const handleSearch = async () => {
    const searchValue = searchType === 'pnr' ? pnr : orderId;
    if (!searchValue) {
      setError('Please enter a PNR or Order ID');
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      const response = await orderRetrieve({
        pnr: searchType === 'pnr' ? pnr : undefined,
        orderId: searchType === 'orderId' ? orderId : undefined,
      });

      // Build route label from retrieved order data
      const flights = response.data?.flights || response.data?.order?.flights || [];
      const origin = flights[0]?.origin || 'XXX';
      const destination = flights[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderRetrieve (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Retrieved existing booking',
      });

      setOrderData(response.data);
      
      updateContext({
        retrievedOrder: response.data,
        orderId: response.data.orderId || response.data.OrderID,
        pnr: response.data.pnr || response.data.PNR,
      });

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Order not found';
      setError(errorMessage);
      
      // For error case, use the search value as identifier since we don't have order data
      const identifier = searchType === 'pnr' ? pnr : orderId;

      addCapture({
        operation: `OrderRetrieve (${identifier})`,
        request: '',
        response: err.response?.data?.xml || `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <Search className="w-6 h-6 text-primary-500" />
          Retrieve Booking
        </h2>

        {/* Search Type Toggle */}
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={searchType === 'pnr'}
              onChange={() => setSearchType('pnr')}
              className="w-4 h-4 text-primary-500"
            />
            <span>PNR / Booking Reference</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={searchType === 'orderId'}
              onChange={() => setSearchType('orderId')}
              className="w-4 h-4 text-primary-500"
            />
            <span>Order ID</span>
          </label>
        </div>

        {/* Search Input */}
        <div className="flex gap-4">
          {searchType === 'pnr' ? (
            <Input
              label="PNR / Booking Reference"
              value={pnr}
              onChange={(e) => setPnr(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="flex-1"
            />
          ) : (
            <Input
              label="Order ID"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="ORD-123456789"
              className="flex-1"
            />
          )}
          <div className="flex items-end">
            <Button
              variant="primary"
              onClick={handleSearch}
              isLoading={isLoading}
              leftIcon={<Search className="w-5 h-5" />}
            >
              Search
            </Button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="error" title="Search Failed">
          {error}
        </Alert>
      )}

      {/* Order Details */}
      {orderData && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-neutral-500">Booking Reference</p>
              <p className="text-2xl font-bold text-primary-600">
                {orderData.pnr || orderData.PNR || orderData.bookingReference}
              </p>
            </div>
            <Badge 
              variant={orderData.status === 'CONFIRMED' ? 'success' : 'secondary'}
              size="lg"
            >
              {orderData.status || 'CONFIRMED'}
            </Badge>
          </div>

          {/* Flight Info */}
          {orderData.flights && (
            <div className="mb-6">
              <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <Plane className="w-5 h-5" />
                Flight Details
              </h3>
              {orderData.flights.map((flight: any, idx: number) => (
                <div key={idx} className="p-3 bg-neutral-50 rounded-lg mb-2">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {flight.origin} → {flight.destination}
                    </span>
                    <span className="text-neutral-500">
                      {flight.flightNumber}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    {flight.departureDate} at {flight.departureTime}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Passengers */}
          {orderData.passengers && (
            <div className="mb-6">
              <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <User className="w-5 h-5" />
                Passengers
              </h3>
              {orderData.passengers.map((pax: any, idx: number) => (
                <div key={idx} className="flex justify-between p-2 border-b border-neutral-100">
                  <span>{pax.title} {pax.firstName} {pax.lastName}</span>
                  <Badge variant="secondary" size="sm">{pax.ptc}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between font-bold text-lg pt-4 border-t">
            <span>Total Paid</span>
            <span className="text-primary-600">
              {formatCurrency(orderData.totalAmount || 0, orderData.currency || 'AUD')}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={() => setOrderData(null)}>
              New Search
            </Button>
            <Button
              variant="primary"
              onClick={nextStep}
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              Manage Booking
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
