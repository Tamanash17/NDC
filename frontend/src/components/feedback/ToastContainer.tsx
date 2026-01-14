import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast, type ToastType } from '@/core/context/ToastContext';

const toastStyles: Record<ToastType, { bg: string; icon: typeof CheckCircle; iconColor: string }> = {
  success: { bg: 'bg-green-50 border-green-200', icon: CheckCircle, iconColor: 'text-green-500' },
  error: { bg: 'bg-red-50 border-red-200', icon: AlertCircle, iconColor: 'text-red-500' },
  warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500' },
  info: { bg: 'bg-blue-50 border-blue-200', icon: Info, iconColor: 'text-blue-500' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type];
        const Icon = style.icon;
        
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-slide-in',
              style.bg
            )}
          >
            <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.iconColor)} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-neutral-900">{toast.title}</p>
              {toast.message && (
                <p className="text-sm text-neutral-600 mt-0.5">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
