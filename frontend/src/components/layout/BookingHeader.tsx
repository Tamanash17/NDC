import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, useWizardSession } from '@/core/context/SessionStore';
import { cn } from '@/lib/cn';
import {
  Plane,
  Clock,
  ChevronLeft,
  AlertTriangle,
  Building2,
  ArrowRight,
  RefreshCw,
  User,
  LogOut,
  ChevronDown
} from 'lucide-react';

// Format time remaining in human readable format
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Get token status and color
function getTokenStatus(remainingMs: number): { status: 'healthy' | 'warning' | 'critical' | 'expired'; color: string; bgColor: string } {
  if (remainingMs <= 0) return { status: 'expired', color: 'text-red-600', bgColor: 'bg-red-50' };
  if (remainingMs < 60000) return { status: 'critical', color: 'text-red-600', bgColor: 'bg-red-50' }; // < 1 min
  if (remainingMs < 300000) return { status: 'warning', color: 'text-amber-600', bgColor: 'bg-amber-50' }; // < 5 min
  return { status: 'healthy', color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
}

interface BookingHeaderProps {
  workflowName?: string;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function BookingHeader({ workflowName = 'Prime Booking', onBack, showBackButton = true }: BookingHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, credentials, environment, logout } = useSession();
  const { bookingType, sellerOrganization, distributorOrganization } = useWizardSession();

  // Handle back navigation - use provided callback or navigate to wizard with state
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      // Navigate to wizard, passing workflow options to restore state
      navigate('/wizard', {
        state: location.state,
        replace: false
      });
    }
  };

  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showSessionExpiredBanner, setShowSessionExpiredBanner] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Update time remaining every second
  useEffect(() => {
    if (!auth?.tokenExpiry) {
      setTimeRemaining(0);
      return;
    }

    const updateTime = () => {
      const remaining = auth.tokenExpiry - Date.now();
      setTimeRemaining(remaining);

      // Show expired banner if token is expired
      if (remaining <= 0) {
        setShowSessionExpiredBanner(true);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [auth?.tokenExpiry]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate('/login');
  };

  const handleReLogin = () => {
    setShowSessionExpiredBanner(false);
    navigate('/login');
  };

  const tokenStatus = getTokenStatus(timeRemaining);
  const apiId = credentials?.apiId || '';

  return (
    <>
      {/* Session Expired Banner */}
      {showSessionExpiredBanner && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 z-[60]">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Your session has expired</span>
          <button
            onClick={handleReLogin}
            className="flex items-center gap-1 px-3 py-1 bg-white text-red-600 text-sm font-medium rounded hover:bg-red-50 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Re-login
          </button>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Back Button, Logo & Breadcrumb */}
            <div className="flex items-center gap-2">
              {/* Back Button */}
              {showBackButton && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Back to Wizard"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">Back</span>
                </button>
              )}

              {/* Separator */}
              {showBackButton && (
                <div className="h-6 w-px bg-slate-200 mx-1" />
              )}

              {/* Logo */}
              <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/')}
              >
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                  <Plane className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-slate-900 hidden md:inline">Jetstar NDC</span>
              </div>

              {/* Workflow Name */}
              <span className="text-slate-400 hidden lg:inline">/</span>
              <span className="text-slate-600 text-sm hidden lg:inline">{workflowName}</span>
            </div>

            {/* Center: Environment Badge */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
                environment === 'PROD'
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              )}>
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  environment === 'PROD' ? 'bg-red-500' : 'bg-emerald-500'
                )} />
                {environment}
              </div>
            </div>

            {/* Right: Session Info */}
            <div className="flex items-center gap-3">
              {/* Token Timer */}
              <div
                className={cn(
                  'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                  tokenStatus.bgColor,
                  tokenStatus.color
                )}
                title={`Token expires at ${auth?.tokenExpiry ? new Date(auth.tokenExpiry).toLocaleTimeString() : 'N/A'}`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>{formatTimeRemaining(timeRemaining)}</span>
              </div>

              {/* Seller/Distributor */}
              {sellerOrganization && (
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg">
                  <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-700">
                    {sellerOrganization.orgCode}
                  </span>
                  {distributorOrganization && (
                    <>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="text-xs font-medium text-slate-700">
                        {distributorOrganization.orgCode}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Booking Type Badge */}
              <div className="hidden sm:flex items-center px-2.5 py-1 bg-slate-100 rounded-lg">
                <span className="text-xs font-medium text-slate-600">
                  {bookingType === 'BOB' ? 'Book on Behalf' : 'Direct'}
                </span>
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded-lg transition-colors',
                    showUserMenu ? 'bg-slate-100' : 'hover:bg-slate-100'
                  )}
                >
                  <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <span className="hidden md:inline text-xs font-medium text-slate-700 max-w-[80px] truncate">
                    {apiId}
                  </span>
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 text-slate-400 transition-transform',
                    showUserMenu && 'rotate-180'
                  )} />
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-20">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-semibold text-slate-900">{apiId}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{credentials?.domain}</p>
                      </div>

                      {/* Session Details */}
                      <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Environment</span>
                          <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded',
                            environment === 'PROD'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-emerald-100 text-emerald-700'
                          )}>
                            {environment}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Token</span>
                          <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1',
                            tokenStatus.bgColor,
                            tokenStatus.color
                          )}>
                            <Clock className="h-3 w-3" />
                            {formatTimeRemaining(timeRemaining)}
                          </span>
                        </div>

                        {sellerOrganization && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Seller</span>
                            <span className="text-xs font-medium text-slate-700">
                              {sellerOrganization.orgCode}
                            </span>
                          </div>
                        )}

                        {distributorOrganization && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Distributor</span>
                            <span className="text-xs font-medium text-slate-700">
                              {distributorOrganization.orgCode}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Mode</span>
                          <span className="text-xs font-medium text-slate-700">
                            {bookingType === 'BOB' ? 'Book on Behalf' : 'Direct'}
                          </span>
                        </div>
                      </div>

                      {/* Sign Out */}
                      <div className="py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
