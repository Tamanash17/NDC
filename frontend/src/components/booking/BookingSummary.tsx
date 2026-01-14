import { Card, Badge } from '@/components/ui';
import { Plane, User, Calendar, MapPin, CreditCard, Luggage, Armchair } from 'lucide-react';
import { formatCurrency, formatDate, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface BookingSummaryProps {
  booking: {
    pnr: string;
    orderId?: string;
    status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'TICKETED';
    flights: Array<{
      flightNumber: string;
      origin: string;
      destination: string;
      departureDate: string;
      departureTime: string;
      arrivalTime: string;
      cabinClass?: string;
    }>;
    passengers: Array<{
      title: string;
      firstName: string;
      lastName: string;
      ptc: string;
    }>;
    services?: Array<{
      name: string;
      quantity: number;
    }>;
    seats?: Array<{
      seatNumber: string;
      passengerName: string;
      segment: string;
    }>;
    pricing: {
      total: number;
      currency: string;
      breakdown?: {
        base: number;
        taxes: number;
        services?: number;
        seats?: number;
      };
    };
    contact?: {
      email: string;
      phone: string;
    };
  };
  compact?: boolean;
  className?: string;
}

const statusColors = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-red-100 text-red-700',
  TICKETED: 'bg-blue-100 text-blue-700',
};

export function BookingSummary({ booking, compact = false, className }: BookingSummaryProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">Booking Reference</p>
          <p className="text-2xl font-bold text-primary-600 tracking-wider">{booking.pnr}</p>
        </div>
        <Badge className={statusColors[booking.status]}>
          {booking.status}
        </Badge>
      </div>

      <div className="p-4 space-y-6">
        {/* Flights */}
        <div>
          <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
            <Plane className="w-5 h-5 text-primary-500" />
            Flight Details
          </h3>
          <div className="space-y-3">
            {booking.flights.map((flight, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold">{flight.departureTime}</p>
                    <p className="text-sm font-medium text-neutral-700">{flight.origin}</p>
                  </div>
                  <div className="flex flex-col items-center px-4">
                    <p className="text-xs text-neutral-500">{flight.flightNumber}</p>
                    <div className="w-16 h-px bg-neutral-300 my-1" />
                    <Plane className="w-4 h-4 text-neutral-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{flight.arrivalTime}</p>
                    <p className="text-sm font-medium text-neutral-700">{flight.destination}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-neutral-500">{formatDate(flight.departureDate)}</p>
                  {flight.cabinClass && (
                    <Badge variant="secondary" size="sm">{flight.cabinClass}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Passengers */}
        {!compact && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5 text-primary-500" />
              Passengers
            </h3>
            <div className="space-y-2">
              {booking.passengers.map((pax, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                  <span className="font-medium">
                    {pax.title} {pax.firstName} {pax.lastName}
                  </span>
                  <Badge variant="secondary" size="sm">{pax.ptc}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services & Seats */}
        {!compact && (booking.services?.length || booking.seats?.length) && (
          <div className="grid grid-cols-2 gap-4">
            {booking.services && booking.services.length > 0 && (
              <div>
                <h4 className="font-medium text-neutral-700 mb-2 flex items-center gap-2">
                  <Luggage className="w-4 h-4" />
                  Extras
                </h4>
                <ul className="text-sm text-neutral-600 space-y-1">
                  {booking.services.map((svc, idx) => (
                    <li key={idx}>{svc.name} x{svc.quantity}</li>
                  ))}
                </ul>
              </div>
            )}
            {booking.seats && booking.seats.length > 0 && (
              <div>
                <h4 className="font-medium text-neutral-700 mb-2 flex items-center gap-2">
                  <Armchair className="w-4 h-4" />
                  Seats
                </h4>
                <ul className="text-sm text-neutral-600 space-y-1">
                  {booking.seats.map((seat, idx) => (
                    <li key={idx}>{seat.seatNumber} - {seat.passengerName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pricing */}
        <div className="pt-4 border-t border-neutral-200">
          {!compact && booking.pricing.breakdown && (
            <div className="space-y-2 mb-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Base Fare</span>
                <span>{formatCurrency(booking.pricing.breakdown.base, booking.pricing.currency)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Taxes & Fees</span>
                <span>{formatCurrency(booking.pricing.breakdown.taxes, booking.pricing.currency)}</span>
              </div>
              {booking.pricing.breakdown.services && (
                <div className="flex justify-between text-neutral-600">
                  <span>Services</span>
                  <span>{formatCurrency(booking.pricing.breakdown.services, booking.pricing.currency)}</span>
                </div>
              )}
              {booking.pricing.breakdown.seats && (
                <div className="flex justify-between text-neutral-600">
                  <span>Seats</span>
                  <span>{formatCurrency(booking.pricing.breakdown.seats, booking.pricing.currency)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary-600">
              {formatCurrency(booking.pricing.total, booking.pricing.currency)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
