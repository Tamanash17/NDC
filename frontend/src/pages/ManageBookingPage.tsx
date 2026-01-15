import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/core/context/ToastContext';
import { orderRetrieve } from '@/lib/ndc-api';
import { Card, Button, Input, Alert, Badge } from '@/components/ui';
import { AppLayout } from '@/components/layout';
import {
  Search, RefreshCw, XCircle, Luggage, Armchair, Plane, User,
  Calendar, Clock, MapPin, Users, CreditCard, Package, Mail, Phone, Home
} from 'lucide-react';

export function ManageBookingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  // Auto-populate PNR from query parameters (e.g., /manage?pnr=UWYYNG)
  const pnrFromUrl = searchParams.get('pnr') || '';
  const [pnr, setPnr] = useState(pnrFromUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);

  // Update PNR when URL changes
  useEffect(() => {
    const urlPnr = searchParams.get('pnr');
    if (urlPnr) {
      setPnr(urlPnr.toUpperCase());
    }
  }, [searchParams]);

  const handleSearch = async () => {
    if (!pnr || pnr.trim().length === 0) {
      setError('Please enter a booking reference (PNR)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await orderRetrieve({ pnr: pnr.trim() });
      console.log('[ManageBooking] Full response:', JSON.stringify(response, null, 2));

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

      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Booking not found';
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      toast.error('Booking not found');
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

  // Helper function to format date/time
  const formatDateTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return { date: dateStr, time: '' };
    }
  };

  // Helper to format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  return (
    <AppLayout title="Manage Booking" backTo="/wizard?mode=servicing">
      <div className="max-w-6xl mx-auto px-4 py-8">
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

        {/* Search Form */}
        {!booking && (
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
        )}

        {/* Booking Details */}
        {booking && (
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

            {/* Booking Header */}
            <Card className="p-6 bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-sm text-orange-600 font-medium mb-1">Booking Reference</p>
                  <p className="text-4xl font-bold text-orange-900 font-mono tracking-wider">
                    {booking.order?.OrderID || booking.orderId || pnr}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Badge variant="success" size="lg" className="px-4 py-2">
                    <span className="text-sm font-semibold">CONFIRMED</span>
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Flight Details */}
            {(booking.DataLists?.PaxJourneyList?.PaxJourney || booking.flights || booking.order?.OrderItem) && (
              <Card className="p-6">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Plane className="w-6 h-6 text-orange-600" />
                  Flight Itinerary
                </h3>
                <div className="space-y-4">
                  {(() => {
                    // Handle PaxJourney as array or single object
                    const journeys = booking.DataLists?.PaxJourneyList?.PaxJourney;
                    if (!journeys) {
                      return <p className="text-slate-500 text-center py-8">No flight details available</p>;
                    }

                    const journeyArray = Array.isArray(journeys) ? journeys : [journeys];
                    const segments = booking.DataLists?.DatedMarketingSegmentList?.DatedMarketingSegment;
                    const segmentArray = segments ? (Array.isArray(segments) ? segments : [segments]) : [];

                    return journeyArray.map((journey: any, idx: number) => {
                      const segmentRefs = Array.isArray(journey.PaxSegmentRefID)
                        ? journey.PaxSegmentRefID
                        : [journey.PaxSegmentRefID];

                      return (
                        <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-100">
                          <div className="flex justify-between items-start mb-4">
                            <Badge variant="secondary" className="font-mono">
                              Journey {idx + 1}
                            </Badge>
                          </div>
                          {segmentRefs.map((segId: string, segIdx: number) => {
                            const segment = segmentArray.find((s: any) => s.DatedMarketingSegmentId === segId);
                            if (!segment) return null;

                            const dep = formatDateTime(segment.Dep?.AircraftScheduledDateTime || '');
                            const arr = formatDateTime(segment.Arrival?.AircraftScheduledDateTime || '');

                            return (
                              <div key={segIdx} className="flex items-center gap-4 py-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <MapPin className="w-5 h-5 text-orange-600" />
                                    <div>
                                      <p className="font-bold text-xl text-slate-900">{segment.Dep?.IATA_LocationCode || 'N/A'}</p>
                                      <p className="text-sm text-slate-600">{dep.date}</p>
                                      <p className="text-sm font-semibold text-slate-700">{dep.time}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center px-4">
                                  <Plane className="w-6 h-6 text-orange-600 transform rotate-90" />
                                  <p className="text-xs font-semibold text-orange-600 mt-1">
                                    {segment.CarrierDesigCode || 'JQ'} {segment.MarketingCarrierFlightNumberText || ''}
                                  </p>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 justify-end">
                                    <div className="text-right">
                                      <p className="font-bold text-xl text-slate-900">{segment.Arrival?.IATA_LocationCode || 'N/A'}</p>
                                      <p className="text-sm text-slate-600">{arr.date}</p>
                                      <p className="text-sm font-semibold text-slate-700">{arr.time}</p>
                                    </div>
                                    <MapPin className="w-5 h-5 text-orange-600" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              </Card>
            )}

            {/* Passengers */}
            {booking.DataLists?.PaxList?.Pax && (
              <Card className="p-6">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-6 h-6 text-orange-600" />
                  Passengers ({Array.isArray(booking.DataLists.PaxList.Pax) ? booking.DataLists.PaxList.Pax.length : 1})
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {(Array.isArray(booking.DataLists.PaxList.Pax) ? booking.DataLists.PaxList.Pax : [booking.DataLists.PaxList.Pax]).map((pax: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-100">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 rounded-lg">
                            <User className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-bold text-lg text-slate-900">
                              {pax.Individual?.GivenName} {pax.Individual?.Surname}
                            </p>
                            <p className="text-sm text-slate-600">Passenger {idx + 1}</p>
                          </div>
                        </div>
                        <Badge variant={pax.PTC === 'ADT' ? 'primary' : pax.PTC === 'CHD' ? 'secondary' : 'warning'}>
                          {pax.PTC}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">Birthdate</p>
                          <p className="font-semibold text-slate-700">{pax.Individual?.Birthdate}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Gender</p>
                          <p className="font-semibold text-slate-700">{pax.Individual?.GenderCode === 'M' ? 'Male' : 'Female'}</p>
                        </div>
                        {pax.LoyaltyProgramAccount && (
                          <>
                            <div className="col-span-2">
                              <p className="text-slate-500">Frequent Flyer</p>
                              <p className="font-semibold text-slate-700">
                                {pax.LoyaltyProgramAccount.LoyaltyProgram?.Carrier?.AirlineDesigCode} {pax.LoyaltyProgramAccount.AccountNumber}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Contact Information */}
            {booking.DataLists?.ContactInfoList?.ContactInfo && (
              <Card className="p-6">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Mail className="w-6 h-6 text-orange-600" />
                  Contact Information
                </h3>
                {(() => {
                  const contact = Array.isArray(booking.DataLists.ContactInfoList.ContactInfo)
                    ? booking.DataLists.ContactInfoList.ContactInfo[0]
                    : booking.DataLists.ContactInfoList.ContactInfo;
                  return (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                        <Mail className="w-5 h-5 text-orange-600" />
                        <div>
                          <p className="text-sm text-slate-500">Email</p>
                          <p className="font-semibold text-slate-900">{contact.EmailAddress?.EmailAddressText}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                        <Phone className="w-5 h-5 text-orange-600" />
                        <div>
                          <p className="text-sm text-slate-500">Phone</p>
                          <p className="font-semibold text-slate-900">{contact.Phone?.PhoneNumber}</p>
                        </div>
                      </div>
                      {contact.PostalAddress && (
                        <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg md:col-span-2">
                          <Home className="w-5 h-5 text-orange-600 mt-1" />
                          <div>
                            <p className="text-sm text-slate-500">Address</p>
                            <p className="font-semibold text-slate-900">
                              {contact.PostalAddress.StreetText}, {contact.PostalAddress.CityName}, {contact.PostalAddress.CountrySubDivisionName} {contact.PostalAddress.PostalCode}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Price Summary */}
            {booking.order?.OrderItem && (
              <Card className="p-6 bg-slate-50">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-orange-600" />
                  Price Summary
                </h3>
                {(() => {
                  const orderItems = Array.isArray(booking.order.OrderItem) ? booking.order.OrderItem : [booking.order.OrderItem];
                  const currency = orderItems[0]?.Price?.TotalAmount?.['@CurCode'] || 'AUD';
                  const total = orderItems.reduce((sum: number, item: any) => {
                    const amount = parseFloat(item.Price?.TotalAmount?.['#text'] || item.Price?.TotalAmount || 0);
                    return sum + amount;
                  }, 0);

                  return (
                    <div className="space-y-3">
                      {orderItems.map((item: any, idx: number) => {
                        const amount = parseFloat(item.Price?.TotalAmount?.['#text'] || item.Price?.TotalAmount || 0);
                        return (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-200">
                            <span className="text-slate-700">{item.OrderItemID}</span>
                            <span className="font-semibold text-slate-900">{formatCurrency(amount, currency)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center pt-4 border-t-2 border-orange-600">
                        <span className="text-lg font-bold text-slate-900">Total</span>
                        <span className="text-2xl font-bold text-orange-600">{formatCurrency(total, currency)}</span>
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Actions */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">
                Manage Your Booking
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => handleAction('change')}
                  className="p-6 rounded-xl border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50 transition-all text-center group"
                >
                  <RefreshCw className="w-10 h-10 text-orange-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-semibold text-slate-900">Change Flight</p>
                  <p className="text-xs text-slate-500 mt-1">Modify date or time</p>
                </button>

                <button
                  onClick={() => handleAction('services')}
                  className="p-6 rounded-xl border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50 transition-all text-center group"
                >
                  <Luggage className="w-10 h-10 text-orange-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-semibold text-slate-900">Add Services</p>
                  <p className="text-xs text-slate-500 mt-1">Baggage, meals</p>
                </button>

                <button
                  onClick={() => handleAction('seats')}
                  className="p-6 rounded-xl border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50 transition-all text-center group"
                >
                  <Armchair className="w-10 h-10 text-orange-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-semibold text-slate-900">Select Seats</p>
                  <p className="text-xs text-slate-500 mt-1">Choose your seats</p>
                </button>

                <button
                  onClick={() => handleAction('cancel')}
                  className="p-6 rounded-xl border-2 border-slate-200 hover:border-red-500 hover:bg-red-50 transition-all text-center group"
                >
                  <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                  <p className="font-semibold text-slate-900">Cancel Booking</p>
                  <p className="text-xs text-slate-500 mt-1">Request cancellation</p>
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
