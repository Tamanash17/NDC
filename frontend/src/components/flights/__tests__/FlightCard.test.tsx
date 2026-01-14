import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { FlightCard } from '@/components/flights';

const mockJourney = {
  journeyId: 'JRN-1',
  segments: [{
    segmentId: 'SEG-1',
    flightNumber: 'JQ001',
    marketingCarrier: 'JQ',
    origin: 'SYD',
    destination: 'MEL',
    departureDate: '2025-03-15',
    departureTime: '08:00',
    arrivalDate: '2025-03-15',
    arrivalTime: '09:30',
    duration: 90,
  }],
  totalDuration: 90,
  stops: 0,
};

const mockBundles = [
  { bundleId: 'B1', bundleName: 'Starter', bundleCode: 'ST', price: 99, currency: 'AUD', tier: 1 as const, inclusions: { baggage: '', meals: false, seatSelection: false, changes: 'Fee', cancellation: 'Non-refundable' } },
  { bundleId: 'B2', bundleName: 'Plus', bundleCode: 'SP', price: 149, currency: 'AUD', tier: 2 as const, inclusions: { baggage: '23kg', meals: false, seatSelection: true, changes: 'Fee', cancellation: 'Fee' } },
];

describe('FlightCard', () => {
  it('renders flight information', () => {
    render(
      <FlightCard
        journey={mockJourney}
        bundles={mockBundles}
        baseFare={299}
        currency="AUD"
        onBundleSelect={vi.fn()}
      />
    );

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('SYD')).toBeInTheDocument();
    expect(screen.getByText('MEL')).toBeInTheDocument();
  });

  it('displays bundle options', () => {
    render(
      <FlightCard
        journey={mockJourney}
        bundles={mockBundles}
        baseFare={299}
        currency="AUD"
        onBundleSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Plus')).toBeInTheDocument();
  });

  it('calls onBundleSelect when bundle is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <FlightCard
        journey={mockJourney}
        bundles={mockBundles}
        baseFare={299}
        currency="AUD"
        onBundleSelect={handleSelect}
      />
    );

    fireEvent.click(screen.getByText('Starter'));
    expect(handleSelect).toHaveBeenCalledWith('B1');
  });

  it('highlights selected bundle', () => {
    render(
      <FlightCard
        journey={mockJourney}
        bundles={mockBundles}
        baseFare={299}
        currency="AUD"
        selectedBundleId="B1"
        onBundleSelect={vi.fn()}
      />
    );

    // Check for selection indicator (checkmark)
    const starterButton = screen.getByText('Starter').closest('button');
    expect(starterButton).toHaveClass('border-primary-500');
  });
});
