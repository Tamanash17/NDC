import { useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePwa } from '@/hooks/usePwa';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const { isInstallable, promptInstall } = usePwa();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isInstallable || isDismissed) return null;

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed) {
      setIsDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-2xl border border-neutral-200 p-4 z-50 animate-slide-in">
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-2 right-2 text-neutral-400 hover:text-neutral-600"
        aria-label="Dismiss"
      >
        <X className="w-5 h-5" />
      </button>
      
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-6 h-6 text-primary-600" />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-neutral-900">
            Install NDC Booking
          </h3>
          <p className="text-sm text-neutral-600 mt-1">
            Install this app for quick access and offline capabilities.
          </p>
          
          <div className="flex gap-2 mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstall}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Install
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDismissed(true)}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
