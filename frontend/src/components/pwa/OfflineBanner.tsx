import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePwa } from '@/hooks/usePwa';
import { cn } from '@/lib/cn';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { isOnline } = usePwa();

  if (isOnline) return null;

  return (
    <div className={cn(
      'fixed top-0 left-0 right-0 z-50',
      'bg-amber-500 text-white py-2 px-4',
      'flex items-center justify-center gap-2 text-sm font-medium'
    )}>
      <WifiOff className="w-4 h-4" />
      <span>You are currently offline. Some features may be unavailable.</span>
    </div>
  );
}
