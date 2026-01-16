import { useState, useEffect } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useToast } from '@/core/context/ToastContext';
import { orderReshop, airShopping } from '@/lib/ndc-api';
import { Card, Button, Input, Alert, Badge } from '@/components/ui';
import { FlightList, type FlightOffer } from '@/components/flights';
import { BookingSummary } from '@/components/booking';
import { RefreshCw, Calendar, Plane, ArrowRight, Loader2, ArrowLeftRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { parseAirShoppingResponse } from '@/lib/parsers';

type ReshopType = 'DATE_CHANGE' | 'FLIGHT_CHANGE';

export function OrderReshopStep() {
  const { context, updateContext, nextStep, prevStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const toast = useToast();
  
  const [reshopType, setReshopType] = useState<ReshopType>('DATE_CHANGE');
  const [newDate, setNewDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternativeFlights, setAlternativeFlights] = useState<FlightOffer[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<{ offerId: string; bundleId: string } | null>(null);
  const [reshopResponseId, setReshopResponseId] = useState<string | null>(null);

  // Get current booking details from context
  const currentBooking = context.retrievedOrder || {
    pnr: context.pnr || 'ABC123',
    orderId: context.orderId,
    status: 'CONFIRMED' as const,
    flights: context.flights || [{
      flightNumber: 'JQ001',
      origin: context.searchParams?.origin || 'SYD',
      destination: context.searchParams?.destination || 'MEL',
      departureDate: context.searchParams?.departureDate || '2025-03-15',
      departureTime: '08:00',
      arrivalTime: '09:30',
    }],
    passengers: context.passengers || [{ title: 'MR', firstName: 'John', lastName: 'Smith', ptc: 'ADT' }],
    pricing: {
      total: context.currentPrice || 299,
      currency: context.currency || 'AUD',
    },
  };

  const handleSearch = async () => {
    if (reshopType === 'DATE_CHANGE' && !newDate) {
      setError('Please select a new date');
      return;
    }

    setIsLoading(true);
    setError(null);
    setAlternativeFlights([]);
    const startTime = Date.now();

    try {
      // For date change, call OrderReshop
      // For flight change, we search for alternative flights
      const response = await orderReshop({
        orderId: context.orderId || currentBooking.orderId || '',
        reshopType,
        newDepartureDate: reshopType === 'DATE_CHANGE' ? newDate : undefined,
        segmentId: currentBooking.flights[0]?.segmentId,
      });

      // Build route label from current booking data
      const origin = currentBooking.flights?.[0]?.origin || 'XXX';
      const destination = currentBooking.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderReshop (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Searched for alternative flights',
      });

      // Parse reshop response for alternative flights
      const parsed = parseAirShoppingResponse(response.data);
      setAlternativeFlights(parsed.offers);
      setReshopResponseId(parsed.shoppingResponseId);

      if (parsed.offers.length === 0) {
        toast.warning('No alternatives found', 'Try selecting a different date');
      } else {
        toast.success('Alternatives found', `${parsed.offers.length} options available`);
      }

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Reshop failed';
      setError(errorMessage);
      toast.error('Search failed', errorMessage);
      
      // Build route label from current booking data
      const origin = currentBooking.flights?.[0]?.origin || 'XXX';
      const destination = currentBooking.flights?.[0]?.destination || 'XXX';
      const routeLabel = `${origin}-${destination}`;

      addCapture({
        operation: `OrderReshop (${routeLabel})`,
        request: '',
        response: err.response?.data?.xml || `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFlightSelect = (offerId: string, bundleId: string) => {
    setSelectedFlight({ offerId, bundleId });
  };

  const handleContinue = () => {
    if (!selectedFlight) return;

    const selectedOffer = alternativeFlights.find(f => f.offerId === selectedFlight.offerId);
    const selectedBundle = selectedOffer?.bundles.find(b => b.bundleId === selectedFlight.bundleId);

    updateContext({
      reshopType,
      reshopResponseId,
      selectedReshopOffer: {
        offerId: selectedFlight.offerId,
        bundleId: selectedFlight.bundleId,
        price: selectedBundle?.price,
      },
      newDepartureDate: newDate,
    });

    nextStep();
  };

  // Min date is tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Current Booking */}
      <BookingSummary booking={currentBooking} compact />

      {/* Reshop Options */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-primary-500" />
          Change Your Flight
        </h2>

        {/* Change Type Selection */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setReshopType('DATE_CHANGE')}
            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
              reshopType === 'DATE_CHANGE'
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <Calendar className="w-8 h-8 text-primary-500 mx-auto mb-2" />
            <p className="font-semibold">Change Date</p>
            <p className="text-sm text-neutral-500">Same route, different date</p>
          </button>
          
          <button
            onClick={() => setReshopType('FLIGHT_CHANGE')}
            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
              reshopType === 'FLIGHT_CHANGE'
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <ArrowLeftRight className="w-8 h-8 text-primary-500 mx-auto mb-2" />
            <p className="font-semibold">Change Flight</p>
            <p className="text-sm text-neutral-500">Different time on same date</p>
          </button>
        </div>

        {/* Date Selection */}
        {reshopType === 'DATE_CHANGE' && (
          <div className="mb-4">
            <Input
              type="date"
              label="New Travel Date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={minDate}
              leftIcon={<Calendar className="w-4 h-4" />}
            />
            <p className="text-sm text-neutral-500 mt-1">
              Current date: {formatDate(currentBooking.flights[0]?.departureDate)}
            </p>
          </div>
        )}

        {/* Search Button */}
        <Button
          variant="primary"
          onClick={handleSearch}
          isLoading={isLoading}
          disabled={reshopType === 'DATE_CHANGE' && !newDate}
          leftIcon={<Plane className="w-5 h-5" />}
        >
          Search Alternatives
        </Button>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="error" title="Search Failed">
          {error}
        </Alert>
      )}

      {/* Alternative Flights */}
      {alternativeFlights.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-neutral-900">
            Available Alternatives
          </h3>
          
          <FlightList
            offers={alternativeFlights}
            selectedOfferId={selectedFlight?.offerId}
            selectedBundleId={selectedFlight?.bundleId}
            onFlightSelect={handleFlightSelect}
            isLoading={isLoading}
          />

          {/* Continue Button */}
          {selectedFlight && (
            <Card className="p-4 bg-primary-50 border-primary-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-600">Selected new flight</p>
                  <p className="font-semibold text-neutral-900">
                    {alternativeFlights.find(f => f.offerId === selectedFlight.offerId)?.journey.segments[0].flightNumber}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleContinue}
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                >
                  Continue to Quote
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Back Button */}
      <div className="flex justify-start">
        <Button variant="outline" onClick={prevStep}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
