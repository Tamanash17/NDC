import { useNavigate } from 'react-router-dom';
import { useSession } from '@/core/context/SessionStore';
import { AppLayout } from '@/components/layout';
import {
  Plane,
  ArrowRight,
  Copy,
  Check,
  Wrench,
} from 'lucide-react';
import { useState, useEffect } from 'react';

export function DashboardPage() {
  const navigate = useNavigate();
  const { environment, credentials, auth } = useSession();
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [status, setStatus] = useState<'connected' | 'expiring' | 'expired'>('connected');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      if (!auth?.tokenExpiry) {
        setStatus('expired');
        setTimeRemaining('Expired');
        return;
      }

      const remaining = auth.tokenExpiry - Date.now();

      if (remaining <= 0) {
        setStatus('expired');
        setTimeRemaining('Expired');
      } else if (remaining <= 5 * 60 * 1000) {
        setStatus('expiring');
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
      } else {
        setStatus('connected');
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [auth?.tokenExpiry]);

  const copyToken = () => {
    if (auth?.token) {
      navigator.clipboard.writeText(auth.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskToken = (token: string) => {
    if (!token) return '-';
    if (token.length <= 20) return token;
    return `${token.substring(0, 10)}...${token.substring(token.length - 10)}`;
  };

  const statusConfig = {
    connected: {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600',
      bgLight: 'bg-emerald-50',
      label: 'Active'
    },
    expiring: {
      bg: 'bg-amber-500',
      text: 'text-amber-600',
      bgLight: 'bg-amber-50',
      label: 'Expiring Soon'
    },
    expired: {
      bg: 'bg-red-500',
      text: 'text-red-600',
      bgLight: 'bg-red-50',
      label: 'Expired'
    },
  };

  return (
    <AppLayout showBack={false}>
      {/* Welcome */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-slate-900 mb-3">
          What would you like to do?
        </h2>
        <p className="text-slate-600 text-lg">
          Select an operation to begin testing Jetstar NDC APIs
        </p>
      </div>

      {/* Main Action Cards */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        {/* Prime Card */}
        <button
          onClick={() => navigate('/wizard?mode=prime')}
          className="group bg-white rounded-xl border-2 border-slate-200 p-8 text-left transition-all duration-300 hover:border-orange-400 hover:shadow-xl hover:shadow-orange-100 active:scale-[0.98]"
        >
          {/* Icon */}
          <div className="w-16 h-16 rounded-xl bg-orange-100 flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-orange-500 group-hover:shadow-lg group-hover:shadow-orange-200">
            <Plane className="w-8 h-8 text-orange-500 transition-colors duration-300 group-hover:text-white" />
          </div>

          {/* Content */}
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-2xl font-bold text-slate-900">Prime</h3>
            <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-600 text-xs font-bold uppercase tracking-wide">
              New Booking
            </span>
          </div>
          <p className="text-slate-600 mb-6 leading-relaxed">
            Create new flight bookings with full NDC workflow including search, pricing, and order creation.
          </p>

          {/* Features */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              AirShopping
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              OfferPrice
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              OrderCreate
            </span>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-2 text-orange-500 font-bold transition-all duration-300 group-hover:gap-4">
            <span>Start New Booking</span>
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </button>

        {/* Servicing Card */}
        <button
          onClick={() => navigate('/wizard?mode=servicing')}
          className="group bg-white rounded-xl border-2 border-slate-200 p-8 text-left transition-all duration-300 hover:border-slate-400 hover:shadow-xl hover:shadow-slate-100 active:scale-[0.98]"
        >
          {/* Icon */}
          <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-slate-700 group-hover:shadow-lg group-hover:shadow-slate-200">
            <Wrench className="w-8 h-8 text-slate-600 transition-colors duration-300 group-hover:text-white" />
          </div>

          {/* Content */}
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-2xl font-bold text-slate-900">Servicing</h3>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wide">
              Manage
            </span>
          </div>
          <p className="text-slate-600 mb-6 leading-relaxed">
            Retrieve and manage existing bookings including modifications, cancellations, and ancillary changes.
          </p>

          {/* Features */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              OrderRetrieve
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              OrderReshop
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600 font-medium">
              OrderChange
            </span>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-2 text-slate-700 font-bold transition-all duration-300 group-hover:gap-4">
            <span>Retrieve Booking</span>
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      {/* Session Details Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">Session Details</span>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${statusConfig[status].bgLight}`}>
            <span className={`w-2 h-2 rounded-full ${statusConfig[status].bg}`} />
            <span className={`text-xs font-bold ${statusConfig[status].text}`}>
              {statusConfig[status].label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-8 mb-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Environment</p>
              <p className="text-base font-bold text-slate-900">{environment}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">API ID</p>
              <p className="text-base font-bold text-slate-900">{credentials?.apiId || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Domain</p>
              <p className="text-base font-bold text-slate-900">{credentials?.domain || 'EXT'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Expires In</p>
              <p className={`text-base font-mono font-bold ${statusConfig[status].text}`}>
                {timeRemaining}
              </p>
            </div>
          </div>

          {/* Token Row */}
          <div className="pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Access Token</p>
                <p className="font-mono text-sm text-slate-600 truncate pr-4">
                  {auth?.token ? maskToken(auth.token) : '-'}
                </p>
              </div>
              <button
                onClick={copyToken}
                disabled={!auth?.token}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default DashboardPage;
