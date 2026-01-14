import { useState, useEffect } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useDistributionContext } from '@/core/context/SessionStore';
import { seatAvailability } from '@/lib/ndc-api';
import { Card, Button, Alert, Badge } from '@/components/ui';
import { Armchair, ArrowRight, Loader2, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Seat {
  seatNumber: string;
  row: number;
  column: string;
  available: boolean;
  price: number;
  currency: string;
  characteristics?: string[];
  seatType: 'standard' | 'extra-legroom' | 'exit' | 'window' | 'aisle' | 'middle';
}

interface SeatMap {
  segmentId: string;
  cabinClass: string;
  rows: number[];
  columns: string[];
  seats: Seat[];
}

export function SeatAvailabilityStep() {
  const { context, updateContext, nextStep, prevStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const distributionContext = useDistributionContext();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seatMaps, setSeatMaps] = useState<SeatMap[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<Map<string, string>>(new Map()); // segmentId -> seatNumber
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  useEffect(() => {
    fetchSeatAvailability();
  }, []);

  const fetchSeatAvailability = async () => {
    if (!context.shoppingResponseId || !context.selectedOffers?.[0]) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();

    try {
      // Build distribution chain from user's session context (same as OfferPrice)
      const distributionChain = distributionContext.isValid ? {
        links: distributionContext.getPartyConfig()?.participants.map(p => ({
          ordinal: p.ordinal,
          orgRole: p.role,
          orgId: p.orgCode,
          orgName: p.orgName,
        })) || []
      } : undefined;

      const response = await seatAvailability({
        shoppingResponseId: context.shoppingResponseId,
        offerId: context.selectedOffers[0].offerId,
        segmentIds: [], // All segments
        distributionChain,
      });

      addCapture({
        operation: 'SeatAvailability',
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Fetched seat map for flight selection',
      });

      const maps = parseSeatMaps(response.data);
      setSeatMaps(maps);
      if (maps.length > 0) setActiveSegment(maps[0].segmentId);

    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load seat map');
      
      addCapture({
        operation: 'SeatAvailability',
        request: '',
        response: err.response?.data?.xml || `<error>${err.message}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const parseSeatMaps = (data: any): SeatMap[] => {
    // Generate mock seat map if no data
    const segments = data.seatMaps || data.segments || [{ segmentId: 'SEG1' }];
    
    return segments.map((seg: any) => {
      const rows = Array.from({ length: 30 }, (_, i) => i + 1);
      const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
      
      const seats: Seat[] = [];
      rows.forEach(row => {
        columns.forEach(col => {
          const isExitRow = row === 12 || row === 13;
          const isWindowOrAisle = col === 'A' || col === 'F' || col === 'C' || col === 'D';
          
          seats.push({
            seatNumber: `${row}${col}`,
            row,
            column: col,
            available: Math.random() > 0.3,
            price: isExitRow ? 35 : isWindowOrAisle ? 15 : 0,
            currency: 'AUD',
            seatType: isExitRow ? 'exit' : col === 'A' || col === 'F' ? 'window' : col === 'C' || col === 'D' ? 'aisle' : 'middle',
          });
        });
      });

      return {
        segmentId: seg.segmentId || 'SEG1',
        cabinClass: seg.cabinClass || 'Economy',
        rows,
        columns,
        seats,
      };
    });
  };

  const handleSeatSelect = (segmentId: string, seatNumber: string) => {
    const seat = seatMaps.find(m => m.segmentId === segmentId)?.seats.find(s => s.seatNumber === seatNumber);
    if (!seat?.available) return;

    setSelectedSeats(prev => {
      const newMap = new Map(prev);
      if (newMap.get(segmentId) === seatNumber) {
        newMap.delete(segmentId);
      } else {
        newMap.set(segmentId, seatNumber);
      }
      return newMap;
    });
  };

  const calculateSeatsTotal = (): number => {
    let total = 0;
    selectedSeats.forEach((seatNumber, segmentId) => {
      const seatMap = seatMaps.find(m => m.segmentId === segmentId);
      const seat = seatMap?.seats.find(s => s.seatNumber === seatNumber);
      if (seat) total += seat.price;
    });
    return total;
  };

  const handleContinue = () => {
    const seatsTotal = calculateSeatsTotal();
    const selectedSeatsList = Array.from(selectedSeats.entries()).map(([segmentId, seatNumber]) => ({
      segmentId,
      seatNumber,
      paxId: 'PAX1',
    }));

    updateContext({
      selectedSeats: selectedSeatsList,
      seatsTotal,
      currentPrice: (context.currentPrice || 0) + seatsTotal,
    });

    nextStep();
  };

  const activeSeatMap = seatMaps.find(m => m.segmentId === activeSegment);
  const seatsTotal = calculateSeatsTotal();

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-neutral-600">Loading seat map...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <Armchair className="w-6 h-6 text-primary-500" />
          Select Your Seat
        </h2>

        {error && (
          <Alert variant="warning" title="Seat map unavailable" className="mb-4">
            {error}. You can continue and select seats later.
          </Alert>
        )}

        {/* Segment Tabs */}
        {seatMaps.length > 1 && (
          <div className="flex gap-2 mb-4">
            {seatMaps.map((map, idx) => (
              <Button
                key={map.segmentId}
                variant={activeSegment === map.segmentId ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setActiveSegment(map.segmentId)}
              >
                Flight {idx + 1}
              </Button>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-neutral-100 border border-neutral-300" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary-500" />
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-neutral-300" />
            <span>Unavailable</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-green-100 border border-green-300" />
            <span>Extra Legroom</span>
          </div>
        </div>

        {/* Seat Map */}
        {activeSeatMap && (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-[320px]">
              {/* Column Headers */}
              <div className="flex justify-center gap-1 mb-2">
                {activeSeatMap.columns.map((col, idx) => (
                  <div key={col} className="w-8 text-center text-sm font-medium text-neutral-500">
                    {col}
                    {idx === 2 && <div className="w-4 inline-block" />}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {activeSeatMap.rows.slice(0, 15).map(row => (
                <div key={row} className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-6 text-right text-xs text-neutral-400">{row}</span>
                  {activeSeatMap.columns.map((col, idx) => {
                    const seat = activeSeatMap.seats.find(s => s.row === row && s.column === col);
                    const isSelected = selectedSeats.get(activeSeatMap.segmentId) === seat?.seatNumber;
                    const isExitRow = row === 12 || row === 13;
                    
                    return (
                      <>
                        <button
                          key={seat?.seatNumber}
                          onClick={() => seat && handleSeatSelect(activeSeatMap.segmentId, seat.seatNumber)}
                          disabled={!seat?.available}
                          className={cn(
                            'w-8 h-8 rounded text-xs font-medium transition-all',
                            !seat?.available && 'bg-neutral-300 cursor-not-allowed',
                            seat?.available && !isSelected && isExitRow && 'bg-green-100 border border-green-300 hover:bg-green-200',
                            seat?.available && !isSelected && !isExitRow && 'bg-neutral-100 border border-neutral-300 hover:bg-neutral-200',
                            isSelected && 'bg-primary-500 text-white'
                          )}
                          title={seat ? `${seat.seatNumber} - ${formatCurrency(seat.price, seat.currency)}` : ''}
                        >
                          {isSelected ? '✓' : seat?.available ? '' : '×'}
                        </button>
                        {idx === 2 && <div className="w-4" />}
                      </>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Seat */}
        {selectedSeats.size > 0 && (
          <div className="mt-4 p-3 bg-primary-50 rounded-lg">
            <p className="text-sm text-neutral-600">Selected seat:</p>
            <p className="font-bold text-primary-700">
              {Array.from(selectedSeats.values()).join(', ')}
              {seatsTotal > 0 && ` (+${formatCurrency(seatsTotal, 'AUD')})`}
            </p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>Back</Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {selectedSeats.size > 0 ? 'Continue with Seat' : 'Skip Seat Selection'}
        </Button>
      </div>
    </div>
  );
}
