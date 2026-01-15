import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/core/context/ToastContext';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useSessionStore } from '@/core/context/SessionStore';
import { orderRetrieve } from '@/lib/ndc-api';
import { transformBookingData } from '@/lib/booking-transform';
import { Card, Button, Alert } from '@/components/ui';
import { AppLayout } from '@/components/layout';
import {
  BookingStatusBanner,
  FlightJourneyTimeline,
  PassengerDetailsCard,
  PaymentSummaryCard,
} from '@/components/booking';
import {
  Search, RefreshCw, XCircle, Luggage, Armchair, Plane,
  Mail, Phone, Home, MapPin
} from 'lucide-react';

export function ManageBookingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { startNewSession, addCapture } = useXmlViewer();
  const { getDistributionContext } = useSessionStore();
  const [searchParams] = useSearchParams();

  // Auto-populate PNR from query parameters (e.g., /manage?pnr=UWYYNG)
  const pnrFromUrl = searchParams.get('pnr') || '';
  const [pnr, setPnr] = useState(pnrFromUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);

  // Transform booking data for display components
  const transformedData = useMemo(() => {
    if (!booking) return null;
    try {
      return transformBookingData(booking);
    } catch (err) {
      console.error('[ManageBooking] Transform error:', err);
      return null;
    }
  }, [booking]);

  // Start a fresh XML logging session for servicing operations
  useEffect(() => {
    startNewSession();
    console.log('[ManageBooking] Started new XML logging session for servicing');
  }, [startNewSession]);

  // Update PNR when URL changes and auto-search if PNR provided
  useEffect(() => {
    const urlPnr = searchParams.get('pnr');
    if (urlPnr) {
      setPnr(urlPnr.toUpperCase());
      // Auto-trigger search when PNR is provided via URL (e.g., from PaymentPage success)
      // Use a small delay to ensure state is set
      const autoSearch = searchParams.get('auto') !== 'false';
      if (autoSearch && urlPnr.trim().length > 0) {
        // Trigger search after component mounts
        setTimeout(() => {
          document.getElementById('pnr-search-btn')?.click();
        }, 100);
      }
    }
  }, [searchParams]);

  const handleSearch = async () => {
    if (!pnr || pnr.trim().length === 0) {
      setError('Please enter a booking reference (PNR)');
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      // Get distribution context from session
      const distributionContext = getDistributionContext();

      const response = await orderRetrieve({
        orderId: pnr.trim(),
        ownerCode: 'JQ',
        distributionChain: distributionContext ? {
          links: distributionContext.links
        } : undefined
      });
      console.log('[ManageBooking] Full response:', JSON.stringify(response, null, 2));

      // Check if the response indicates an error
      if (response.success === false) {
        // Capture failed transaction
        addCapture({
          operation: 'OrderRetrieve',
          request: response.requestXml || '',
          response: response.responseXml || '',
          duration: Date.now() - startTime,
          status: 'error',
          userAction: `Failed to retrieve booking ${pnr.trim()}`,
        });

        const errorMsg = response.error || response.errors?.[0]?.message || 'Booking retrieval failed';
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      // Capture XML transaction
      addCapture({
        operation: 'OrderRetrieve',
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: Date.now() - startTime,
        status: 'success',
        userAction: `Retrieved booking ${pnr.trim()}`,
      });

      // Try different response structures
      const bookingData = response.data || response.parsed || response.Response || response;
      console.log('[ManageBooking] Booking data:', bookingData);

      if (!bookingData) {
        throw new Error('No booking data received');
      }

      setBooking(bookingData);
      toast.success('Booking found');
    } catch (err: any) {
      console.error('[ManageBooking] Search error:', err);
      console.error('[ManageBooking] Error response:', err.response);

      // Capture failed transaction
      addCapture({
        operation: 'OrderRetrieve',
        request: err.response?.data?.requestXml || '',
        response: err.response?.data?.responseXml || `<error>${err.message}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
        userAction: `Failed to retrieve booking ${pnr.trim()}`,
      });

      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Booking not found';
      const displayError = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
      setError(displayError);
      toast.error(displayError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: 'change' | 'cancel' | 'services' | 'seats') => {
    // Store booking in session and navigate
    sessionStorage.setItem('currentBooking', JSON.stringify(booking));

    switch (action) {
      case 'change':
        navigate('/booking/manage/change');
        break;
      case 'cancel':
        navigate('/booking/manage/cancel');
        break;
      case 'services':
        navigate('/booking/manage/services');
        break;
      case 'seats':
        navigate('/booking/manage/seats');
        break;
    }
  };

  return (
    <AppLayout title="Manage Booking" backTo="/wizard?mode=servicing">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Search Form (when no booking) */}
        {!booking && (
          <>
            {/* Header with Gradient */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 mb-8 text-white shadow-lg">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Search className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold">Manage Booking</h1>
                  <p className="text-orange-100 mt-1">Retrieve and manage your Jetstar booking</p>
                </div>
              </div>
            </div>

            <Card className="p-8 shadow-xl border-0 bg-white">
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                    <Search className="w-8 h-8 text-orange-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Find Your Booking</h2>
                  <p className="text-slate-600">Enter your booking reference to view and manage your flight</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Booking Reference (PNR) *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={pnr}
                        onChange={(e) => setPnr(e.target.value.toUpperCase())}
                        placeholder="e.g., WKQGQC"
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full px-4 py-4 text-lg font-mono uppercase border-2 border-slate-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all outline-none"
                        maxLength={6}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Plane className="w-5 h-5" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Your booking reference is a 6-character code (e.g., ABC123)
                    </p>
                  </div>

                  <Button
                    id="pnr-search-btn"
                    variant="primary"
                    onClick={handleSearch}
                    isLoading={isLoading}
                    className="w-full py-4 text-lg font-semibold bg-orange-600 hover:bg-orange-700 shadow-lg hover:shadow-xl transition-all"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Find Booking
                      </>
                    )}
                  </Button>

                  {error && (
                    <Alert variant="error" className="mt-4 border-l-4 border-red-500">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Booking Not Found</p>
                          <p className="text-sm mt-1">{error}</p>
                        </div>
                      </div>
                    </Alert>
                  )}
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Booking Details Display */}
        {booking && transformedData && (
          <div className="space-y-6">
            {/* New Search Button */}
            <Button
              variant="outline"
              onClick={() => setBooking(null)}
              className="mb-2"
            >
              <Search className="w-4 h-4 mr-2" />
              New Search
            </Button>

            {/* Status Banner - The WOW Header */}
            <BookingStatusBanner
              health={transformedData.status.health}
              headline={transformedData.status.headline}
              subheadline={transformedData.status.subheadline}
              actionRequired={transformedData.status.actionRequired}
              urgentDeadline={transformedData.status.urgentDeadline}
              paymentStatus={transformedData.status.paymentStatus}
              orderStatus={transformedData.status.orderStatus}
              deliveryStatus={transformedData.status.deliveryStatus}
              pnr={transformedData.pnr || pnr}
              onActionClick={() => navigate('/payment')}
            />

            {/* Flight Journey Timeline */}
            {transformedData.journeys.length > 0 && (
              <FlightJourneyTimeline
                journeys={transformedData.journeys}
                showDetails={true}
              />
            )}

            {/* Passengers */}
            {transformedData.passengers.length > 0 && (
              <PassengerDetailsCard
                passengers={transformedData.passengers}
                showServices={true}
              />
            )}

            {/* Contact Information */}
            {transformedData.contactInfo && (
              <Card className="p-6 bg-white shadow-lg border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-orange-600" />
                  Contact Information
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {transformedData.contactInfo.email && (
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <Mail className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="font-medium text-gray-900">{transformedData.contactInfo.email}</p>
                      </div>
                    </div>
                  )}
                  {transformedData.contactInfo.phone && (
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <Phone className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="font-medium text-gray-900">{transformedData.contactInfo.phone}</p>
                      </div>
                    </div>
                  )}
                  {transformedData.contactInfo.address && (
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <MapPin className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="text-xs text-gray-500">Address</p>
                        <p className="font-medium text-gray-900">
                          {[
                            transformedData.contactInfo.address.city,
                            transformedData.contactInfo.address.country
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Payment Summary */}
            <PaymentSummaryCard
              paymentStatus={transformedData.payment.status}
              paymentMethod={transformedData.payment.method}
              totalAmount={transformedData.payment.totalAmount}
              amountPaid={transformedData.payment.amountPaid}
              breakdown={transformedData.payment.breakdown}
              showBreakdown={true}
            />

            {/* Quick Actions */}
            <Card className="p-6 bg-white shadow-lg border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-6">
                Manage Your Booking
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ActionButton
                  onClick={() => handleAction('change')}
                  icon={RefreshCw}
                  title="Change Flight"
                  description="Modify date or time"
                  variant="default"
                />
                <ActionButton
                  onClick={() => handleAction('services')}
                  icon={Luggage}
                  title="Add Services"
                  description="Baggage, meals"
                  variant="default"
                />
                <ActionButton
                  onClick={() => handleAction('seats')}
                  icon={Armchair}
                  title="Select Seats"
                  description="Choose your seats"
                  variant="default"
                />
                <ActionButton
                  onClick={() => handleAction('cancel')}
                  icon={XCircle}
                  title="Cancel Booking"
                  description="Request cancellation"
                  variant="danger"
                />
              </div>
            </Card>
          </div>
        )}

        {/* Fallback: Show raw data if transformation fails */}
        {booking && !transformedData && (
          <div className="space-y-6">
            <Alert variant="warning">
              <p>Unable to fully parse booking data. Showing raw details.</p>
            </Alert>

            <Button
              variant="outline"
              onClick={() => setBooking(null)}
              className="mb-2"
            >
              <Search className="w-4 h-4 mr-2" />
              New Search
            </Button>

            <Card className="p-6">
              <pre className="text-xs overflow-auto max-h-96 bg-gray-50 p-4 rounded-lg">
                {JSON.stringify(booking, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Action Button Component
interface ActionButtonProps {
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
  variant: 'default' | 'danger';
}

function ActionButton({ onClick, icon: Icon, title, description, variant }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-6 rounded-xl border-2 transition-all text-center group ${
        variant === 'danger'
          ? 'border-gray-200 hover:border-red-500 hover:bg-red-50'
          : 'border-gray-200 hover:border-orange-500 hover:bg-orange-50'
      }`}
    >
      <Icon className={`w-10 h-10 mx-auto mb-3 group-hover:scale-110 transition-transform ${
        variant === 'danger' ? 'text-red-500' : 'text-orange-600'
      }`} />
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </button>
  );
}
