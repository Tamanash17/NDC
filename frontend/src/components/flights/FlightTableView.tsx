/**
 * FlightTableView - GDS-style tabular flight display
 *
 * Main container component that orchestrates:
 * - Section header (OUTBOUND/RETURN)
 * - Sortable column headers
 * - Expandable flight rows
 * - Selection handling
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui';
import { Plane } from 'lucide-react';
import { FlightRow } from './FlightRow';
import { FlightTableHeader, type SortOption } from './FlightTableHeader';
import { FlightSectionHeader } from './FlightSectionHeader';
import type { FlightOffer } from './FlightList';

export interface FlightTableViewProps {
  direction: 'outbound' | 'return';
  offers: FlightOffer[];
  selectedOfferId?: string;
  selectedBundleId?: string;
  onFlightSelect: (offerId: string, bundleId: string) => void;
  route: {
    origin: string;
    destination: string;
  };
  date: string;
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
  isLoading?: boolean;
  className?: string;
}

export function FlightTableView({
  direction,
  offers,
  selectedOfferId,
  selectedBundleId,
  onFlightSelect,
  route,
  date,
  passengers,
  isLoading,
  className,
}: FlightTableViewProps) {
  // Local state for expansion and sorting
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('price');
  const [sortAsc, setSortAsc] = useState(true);

  // Sort offers
  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'price':
          const priceA = a.baseFare + Math.min(...a.bundles.map(bun => bun.price));
          const priceB = b.baseFare + Math.min(...b.bundles.map(bun => bun.price));
          comparison = priceA - priceB;
          break;
        case 'duration':
          comparison = a.journey.totalDuration - b.journey.totalDuration;
          break;
        case 'departure':
          const timeA = a.journey.segments[0].departureTime;
          const timeB = b.journey.segments[0].departureTime;
          comparison = timeA.localeCompare(timeB);
          break;
        case 'stops':
          comparison = a.journey.stops - b.journey.stops;
          break;
      }

      return sortAsc ? comparison : -comparison;
    });
  }, [offers, sortBy, sortAsc]);

  // Handle sort toggle
  const handleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  };

  // Handle row expand - only one expanded at a time
  const handleToggleExpand = (offerId: string) => {
    setExpandedOfferId(expandedOfferId === offerId ? null : offerId);
  };

  // Handle bundle selection - clicking bundle immediately selects flight+bundle
  const handleSelectBundle = (offerId: string, bundleId: string) => {
    onFlightSelect(offerId, bundleId);
    // Collapse the row after selection
    setExpandedOfferId(null);
  };

  // Get selected flight info for header display
  const selectedOffer = offers.find(o => o.offerId === selectedOfferId);
  const selectedBundle = selectedOffer?.bundles.find(b => b.bundleId === selectedBundleId);
  const selectedFlightInfo = selectedOffer && selectedBundle
    ? `${selectedOffer.journey.segments[0].marketingCarrier} ${selectedOffer.journey.segments[0].flightNumber} ${selectedBundle.bundleName}`
    : undefined;

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <FlightSectionHeader
          direction={direction}
          origin={route.origin}
          destination={route.destination}
          date={date}
          isComplete={false}
        />
        <div className="p-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-neutral-100 rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  // Empty state
  if (offers.length === 0) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <FlightSectionHeader
          direction={direction}
          origin={route.origin}
          destination={route.destination}
          date={date}
          isComplete={false}
        />
        <div className="p-12 text-center">
          <Plane className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-700 mb-2">
            No flights found
          </h3>
          <p className="text-neutral-500">
            Try adjusting your search criteria
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('rounded-xl overflow-hidden shadow-xl border border-neutral-200/50', className)}>
      {/* Section Header */}
      <FlightSectionHeader
        direction={direction}
        origin={route.origin}
        destination={route.destination}
        date={date}
        isComplete={!!selectedOfferId}
        selectedFlightInfo={selectedFlightInfo}
      />

      {/* Table Header with Sort Controls */}
      <FlightTableHeader
        sortBy={sortBy}
        sortAsc={sortAsc}
        onSort={handleSort}
        flightCount={offers.length}
      />

      {/* Flight Rows */}
      <div className="bg-white divide-y divide-neutral-100">
        {sortedOffers.map((offer) => {
          // Get default bundle for initial display
          const defaultBundle = offer.bundles.find(b => b.price === 0) || offer.bundles[0];
          const effectiveBundleId = selectedOfferId === offer.offerId
            ? (selectedBundleId || defaultBundle?.bundleId)
            : defaultBundle?.bundleId;

          return (
            <FlightRow
              key={offer.offerId}
              offer={offer}
              isExpanded={expandedOfferId === offer.offerId}
              isSelected={selectedOfferId === offer.offerId}
              selectedBundleId={effectiveBundleId}
              onToggleExpand={() => handleToggleExpand(offer.offerId)}
              onSelectBundle={(bundleId) => handleSelectBundle(offer.offerId, bundleId)}
              passengers={passengers}
            />
          );
        })}
      </div>
    </div>
  );
}
