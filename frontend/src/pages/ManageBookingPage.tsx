import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/core/context/ToastContext';
import { orderRetrieve } from '@/lib/ndc-api';
import { Card, Button, Input, Alert } from '@/components/ui';
import { BookingSummary } from '@/components/booking';
import { AppLayout } from '@/components/layout';
import { Search, RefreshCw, XCircle, Luggage, Armchair } from 'lucide-react';

export function ManageBookingPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [pnr, setPnr] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);

  const handleSearch = async () => {
    if (!pnr) {
      setError('Please enter a booking reference');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await orderRetrieve({ pnr });
      setBooking(response.data);
      toast.success('Booking found');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Booking not found');
      toast.error('Search failed', 'Booking not found');
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
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 mb-8">Manage Booking</h1>

        {/* Search Form */}
        {!booking && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <Search className="w-6 h-6 text-primary-500" />
              Find Your Booking
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input
                label="Booking Reference (PNR)"
                value={pnr}
                onChange={(e) => setPnr(e.target.value.toUpperCase())}
                placeholder="ABC123"
              />
              <Input
                label="Last Name (optional)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
              />
            </div>

            <Button
              variant="primary"
              onClick={handleSearch}
              isLoading={isLoading}
              leftIcon={<Search className="w-5 h-5" />}
            >
              Find Booking
            </Button>

            {error && (
              <Alert variant="error" className="mt-4">
                {error}
              </Alert>
            )}
          </Card>
        )}

        {/* Booking Details */}
        {booking && (
          <>
            <Button
              variant="ghost"
              onClick={() => setBooking(null)}
              className="mb-4"
            >
              Search Again
            </Button>

            <BookingSummary booking={booking} className="mb-6" />

            {/* Actions */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                What would you like to do?
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => handleAction('change')}
                  className="p-4 rounded-lg border-2 border-neutral-200 hover:border-primary-500 hover:bg-primary-50 transition-all text-center"
                >
                  <RefreshCw className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                  <p className="font-medium">Change Flight</p>
                  <p className="text-xs text-neutral-500">Date or time</p>
                </button>

                <button
                  onClick={() => handleAction('services')}
                  className="p-4 rounded-lg border-2 border-neutral-200 hover:border-primary-500 hover:bg-primary-50 transition-all text-center"
                >
                  <Luggage className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                  <p className="font-medium">Add Extras</p>
                  <p className="text-xs text-neutral-500">Bags, meals</p>
                </button>

                <button
                  onClick={() => handleAction('seats')}
                  className="p-4 rounded-lg border-2 border-neutral-200 hover:border-primary-500 hover:bg-primary-50 transition-all text-center"
                >
                  <Armchair className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                  <p className="font-medium">Select Seats</p>
                  <p className="text-xs text-neutral-500">Choose seats</p>
                </button>

                <button
                  onClick={() => handleAction('cancel')}
                  className="p-4 rounded-lg border-2 border-neutral-200 hover:border-red-500 hover:bg-red-50 transition-all text-center"
                >
                  <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="font-medium">Cancel</p>
                  <p className="text-xs text-neutral-500">Cancel booking</p>
                </button>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
