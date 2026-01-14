/**
 * FlightTableHeader - Sortable column headers for flight table
 *
 * Displays column headers with sort indicators
 */

import { cn } from '@/lib/cn';
import { ChevronUp, ChevronDown } from 'lucide-react';

export type SortOption = 'price' | 'duration' | 'departure' | 'stops';

export interface FlightTableHeaderProps {
  sortBy: SortOption;
  sortAsc: boolean;
  onSort: (option: SortOption) => void;
  flightCount: number;
}

interface ColumnConfig {
  key: SortOption | null;
  label: string;
  className: string;
  sortable: boolean;
}

// Grid template must match FlightRow exactly: 40px_120px_140px_70px_70px_70px_70px_120px_90px
const COLUMNS: ColumnConfig[] = [
  { key: null, label: '', className: '', sortable: false }, // Expand icon (40px)
  { key: null, label: 'Flight', className: '', sortable: false }, // 120px
  { key: null, label: 'Route', className: '', sortable: false }, // 140px
  { key: 'departure', label: 'Depart', className: 'text-center', sortable: true }, // 70px
  { key: null, label: 'Arrive', className: 'text-center', sortable: false }, // 70px
  { key: 'duration', label: 'Duration', className: 'text-center', sortable: true }, // 70px
  { key: 'stops', label: 'Stops', className: 'text-center', sortable: true }, // 70px
  { key: null, label: 'Fare', className: 'text-center', sortable: false }, // 120px
  { key: 'price', label: 'Price', className: 'text-right pr-2', sortable: true }, // 90px
];

export function FlightTableHeader({
  sortBy,
  sortAsc,
  onSort,
  flightCount,
}: FlightTableHeaderProps) {
  return (
    <div className="bg-gradient-to-b from-neutral-50 to-neutral-100 border-b border-neutral-200">
      {/* Sort Controls Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/80">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Sort by:</span>
          <div className="flex items-center gap-1 bg-white rounded-lg p-1 shadow-sm border border-neutral-200/80">
            {(['price', 'duration', 'departure', 'stops'] as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => onSort(option)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                  sortBy === option
                    ? 'bg-primary-500 text-white shadow-md'
                    : 'text-neutral-600 hover:bg-neutral-100'
                )}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
                {sortBy === option && (
                  sortAsc ? <ChevronUp className="inline w-3 h-3 ml-1" /> : <ChevronDown className="inline w-3 h-3 ml-1" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-neutral-200/80 shadow-sm">
          <span className="text-sm font-semibold text-neutral-700">
            {flightCount}
          </span>
          <span className="text-sm text-neutral-500">
            flight{flightCount !== 1 ? 's' : ''} found
          </span>
        </div>
      </div>

      {/* Column Headers - Grid must match FlightRow exactly */}
      <div className="grid grid-cols-[40px_120px_140px_70px_70px_70px_70px_120px_90px] items-center px-2 py-2.5 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
        {COLUMNS.map((col, idx) => (
          <div key={idx} className={col.className}>
            {col.sortable && col.key ? (
              <button
                onClick={() => onSort(col.key!)}
                className={cn(
                  'flex items-center gap-1 hover:text-neutral-600 transition-colors',
                  col.className.includes('text-center') && 'justify-center w-full',
                  col.className.includes('text-right') && 'justify-end w-full',
                  sortBy === col.key && 'text-primary-600'
                )}
              >
                {col.label}
                {sortBy === col.key && (
                  sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span>{col.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
