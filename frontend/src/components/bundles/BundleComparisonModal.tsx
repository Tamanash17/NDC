import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Button, Card } from '@/components/ui';
import type { Bundle, BundleInclusion } from './BundleSelector';

export interface BundleComparisonProps {
  bundles: Bundle[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bundleId: string) => void;
  selectedBundleId?: string;
}

export function BundleComparisonModal({
  bundles,
  isOpen,
  onClose,
  onSelect,
  selectedBundleId,
}: BundleComparisonProps) {
  if (!isOpen) return null;

  const sortedBundles = [...bundles].sort((a, b) => a.tier - b.tier);
  
  // Get all unique inclusion types across all bundles
  const allInclusionTypes = Array.from(
    new Set(bundles.flatMap(b => b.inclusions.map(i => i.type)))
  );

  // Group inclusions by type for comparison
  const getInclusionByType = (bundle: Bundle, type: string): BundleInclusion | undefined => {
    return bundle.inclusions.find(i => i.type === type);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <Card className="relative max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-xl font-bold text-neutral-900">Compare Bundles</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Comparison Table */}
        <div className="overflow-auto p-4">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left p-3 bg-neutral-50 rounded-tl-lg">Feature</th>
                {sortedBundles.map((bundle) => (
                  <th 
                    key={bundle.bundleId}
                    className={cn(
                      'p-3 text-center bg-neutral-50',
                      bundle === sortedBundles[sortedBundles.length - 1] && 'rounded-tr-lg'
                    )}
                  >
                    <div className="font-bold text-neutral-900">{bundle.bundleName}</div>
                    <div className="text-lg font-bold text-primary-600 mt-1">
                      {formatCurrency(bundle.price, bundle.currency)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allInclusionTypes.map((type, index) => (
                <tr key={type} className={index % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                  <td className="p-3 font-medium text-neutral-700 capitalize">
                    {type.replace('_', ' ')}
                  </td>
                  {sortedBundles.map((bundle) => {
                    const inclusion = getInclusionByType(bundle, type);
                    return (
                      <td key={bundle.bundleId} className="p-3 text-center">
                        {inclusion?.included ? (
                          <span className="text-green-600">
                            {inclusion.value || '✓'}
                          </span>
                        ) : (
                          <span className="text-neutral-400">✗</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50">
          {sortedBundles.map((bundle) => (
            <Button
              key={bundle.bundleId}
              variant={selectedBundleId === bundle.bundleId ? 'primary' : 'outline'}
              onClick={() => {
                onSelect(bundle.bundleId);
                onClose();
              }}
            >
              Select {bundle.bundleName}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
