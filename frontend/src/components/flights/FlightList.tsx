import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { FlightCard, type FlightJourney, type BundleOption } from './FlightCard';
import { Button, Card } from '@/components/ui';
import { SortAsc, SortDesc, Plane, ChevronLeft, ChevronRight } from 'lucide-react';

const FLIGHTS_PER_PAGE = 5;

// Price breakdown from AirShopping response (per offer item)
export interface AirShoppingPriceBreakdown {
  baseAmount: number;       // Base fare before taxes
  taxAmount: number;        // Total taxes
  totalAmount: number;      // Total (base + taxes)
  currency: string;
}

// Per-passenger-type pricing from AirShopping offer items
export interface PerPaxTypePricing {
  paxType: 'ADT' | 'CHD' | 'INF';
  paxCount: number;
  perPersonAmount: number;  // Amount per person of this type
  totalAmount: number;      // perPersonAmount * paxCount
  currency: string;
}

// Per-item paxRefIds structure for correct OfferPrice request
export interface OfferItemWithPax {
  offerItemId: string;
  paxRefIds: string[];
}

export interface FlightOffer {
  offerId: string;
  journey: FlightJourney;
  bundles: BundleOption[];
  baseFare: number;   // Base fare price (economy fare)
  currency: string;
  // Fare information
  fareBasisCode?: string;
  cabinType?: string;  // Cabin code (5=Economy, 4=Business)
  rbd?: string;  // Reservation Booking Designator
  // Shopping response ID for this offer (needed for OfferPrice)
  shoppingResponseId?: string;
  // Base offer item IDs (flight fare items) - needed for OfferPrice along with bundle
  offerItemIds?: string[];
  // Passenger reference IDs from AirShopping - needed for OfferPrice (legacy flat list)
  paxRefIds?: string[];
  // NEW: Per-item paxRefIds for correct OfferPrice request structure
  offerItemsWithPax?: OfferItemWithPax[];
  // Detailed price breakdown from AirShopping (for OfferPrice comparison)
  priceBreakdown?: AirShoppingPriceBreakdown;
  // Per-passenger-type pricing from AirShopping offer items
  perPaxPricing?: PerPaxTypePricing[];
}

export interface FlightListProps {
  offers: FlightOffer[];
  selectedOfferId?: string;
  selectedBundleId?: string;
  onFlightSelect: (offerId: string, bundleId: string) => void;
  isLoading?: boolean;
  className?: string;
  // Passenger counts for per-person pricing display
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
}

type SortOption = 'price' | 'duration' | 'departure';

export function FlightList({
  offers,
  selectedOfferId,
  selectedBundleId,
  onFlightSelect,
  isLoading,
  className,
  passengers,
}: FlightListProps) {
  const [sortBy, setSortBy] = useState<SortOption>('price');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when offers change
  useEffect(() => {
    setCurrentPage(1);
  }, [offers]);

  const sortedOffers = [...offers].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'price':
        // Total price = base fare + lowest bundle upgrade
        const priceA = a.baseFare + Math.min(...a.bundles.map(b => b.price));
        const priceB = b.baseFare + Math.min(...b.bundles.map(b => b.price));
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
    }
    
    return sortAsc ? comparison : -comparison;
  });

  const handleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="h-48 animate-pulse bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <Card className={cn('p-8 text-center', className)}>
        <Plane className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-700 mb-2">
          No flights found
        </h3>
        <p className="text-neutral-500">
          Try adjusting your search criteria
        </p>
      </Card>
    );
  }

  // Pagination
  const totalPages = Math.ceil(sortedOffers.length / FLIGHTS_PER_PAGE);
  const startIndex = (currentPage - 1) * FLIGHTS_PER_PAGE;
  const paginatedOffers = sortedOffers.slice(startIndex, startIndex + FLIGHTS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of flight list
    window.scrollTo({ top: 200, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-neutral-500 mr-2">Sort by:</span>
        {(['price', 'duration', 'departure'] as SortOption[]).map((option) => (
          <Button
            key={option}
            variant={sortBy === option ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleSort(option)}
            rightIcon={sortBy === option ? (sortAsc ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />) : undefined}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </Button>
        ))}
        <span className="ml-auto text-sm text-neutral-500">
          {offers.length} flight{offers.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Flight Cards */}
      <div className="space-y-4">
        {paginatedOffers.map((offer) => {
          // Default to the "included" bundle (price = $0) - this is Starter for Economy, Business for Business class
          const includedBundle = offer.bundles.find(b => b.price === 0);
          const defaultBundleId = includedBundle?.bundleId;

          // If this offer is selected, use the selectedBundleId; otherwise show Starter as default
          const effectiveBundleId = selectedOfferId === offer.offerId
            ? (selectedBundleId || defaultBundleId)
            : defaultBundleId;

          return (
            <FlightCard
              key={offer.offerId}
              journey={offer.journey}
              bundles={offer.bundles}
              baseFare={offer.baseFare}
              currency={offer.currency}
              selectedBundleId={effectiveBundleId}
              onBundleSelect={(bundleId) => onFlightSelect(offer.offerId, bundleId)}
              isSelected={selectedOfferId === offer.offerId}
              fareBasisCode={offer.fareBasisCode}
              cabinType={offer.cabinType}
              rbd={offer.rbd}
              passengers={passengers}
            />
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            leftIcon={<ChevronLeft className="w-4 h-4" />}
          >
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  page === currentPage
                    ? 'bg-primary-500 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                )}
              >
                {page}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            rightIcon={<ChevronRight className="w-4 h-4" />}
          >
            Next
          </Button>

          <span className="text-sm text-neutral-500 ml-4">
            Showing {startIndex + 1}-{Math.min(startIndex + FLIGHTS_PER_PAGE, sortedOffers.length)} of {sortedOffers.length}
          </span>
        </div>
      )}
    </div>
  );
}
