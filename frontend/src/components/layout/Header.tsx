import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/core/context';
import { cn } from '@/lib/cn';
import {
  User,
  LogOut,
  Settings,
  HelpCircle,
  ChevronDown,
  Plane,
  Clock,
  AlertTriangle,
  Building2,
  ArrowRight,
  RefreshCw
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
function getTokenStatus(remainingMs: number): { status: 'healthy' | 'warning' | 'critical' | 'expired'; color: string } {
  if (remainingMs <= 0) return { status: 'expired', color: 'text-error-600 bg-error-50' };
  if (remainingMs < 60000) return { status: 'critical', color: 'text-error-600 bg-error-50' }; // < 1 min
  if (remainingMs < 300000) return { status: 'warning', color: 'text-warning-600 bg-warning-50' }; // < 5 min
  return { status: 'healthy', color: 'text-success-600 bg-success-50' };
}

export function Header() {
  const navigate = useNavigate();
  const {
    auth,
    isAuthenticated,
    credentials,
    sellerOrganization,
    distributorOrganization,
    bookingType,
    operationType,
    environment,
    logout
  } = useSession();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showSessionExpiredBanner, setShowSessionExpiredBanner] = useState(false);

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
      if (remaining <= 0 && isAuthenticated) {
        setShowSessionExpiredBanner(true);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [auth?.tokenExpiry, isAuthenticated]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    setShowSessionExpiredBanner(false);
    navigate('/login');
  };

  const handleReLogin = () => {
    // Keep credentials for re-login convenience
    setShowSessionExpiredBanner(false);
    navigate('/login');
  };

  const tokenStatus = getTokenStatus(timeRemaining);
  const apiId = credentials?.apiId || '';

  // Determine what context info to show
  const hasContext = bookingType || sellerOrganization;
  const contextLabel = bookingType === 'BOB' ? 'Book on Behalf' : bookingType === 'DIRECT' ? 'Direct' : null;

  return (
    <>
      {/* Session Expired Banner */}
      {showSessionExpiredBanner && (
        <div className="bg-error-600 text-white px-4 py-2 flex items-center justify-center gap-3">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Your session has expired</span>
          <button
            onClick={handleReLogin}
            className="flex items-center gap-1 px-3 py-1 bg-white text-error-600 text-sm font-medium rounded hover:bg-error-50 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Re-login
          </button>
        </div>
      )}

      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo & Branding */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/')}
              >
                <div className="flex items-center justify-center w-9 h-9 bg-primary-500 rounded-lg">
                  <Plane className="h-5 w-5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-base font-bold text-neutral-900 leading-tight">
                    Jetstar NDC
                  </h1>
                </div>
              </div>

              {/* Breadcrumb / Context */}
              {isAuthenticated && hasContext && (
                <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-neutral-200">
                  {contextLabel && (
                    <span className="text-sm text-neutral-500">{contextLabel}</span>
                  )}
                  {operationType && (
                    <>
                      <ChevronDown className="h-3 w-3 text-neutral-400 rotate-[-90deg]" />
                      <span className="text-sm font-medium text-neutral-700">
                        {operationType === 'PRIME' ? 'Prime Booking' : 'Servicing'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Center - Environment Badge */}
            {isAuthenticated && (
              <div className="absolute left-1/2 transform -translate-x-1/2">
                <span
                  className={cn(
                    'px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5',
                    environment === 'PROD'
                      ? 'bg-error-100 text-error-700 border border-error-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  )}
                >
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    environment === 'PROD' ? 'bg-error-500' : 'bg-emerald-500'
                  )} />
                  {environment}
                </span>
              </div>
            )}

            {/* Right side */}
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  {/* Token Timer */}
                  <div
                    className={cn(
                      'hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                      tokenStatus.color
                    )}
                    title={`Token expires at ${auth?.tokenExpiry ? new Date(auth.tokenExpiry).toLocaleTimeString() : 'N/A'}`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatTimeRemaining(timeRemaining)}</span>
                  </div>

                  {/* Seller/Distributor Context */}
                  {sellerOrganization && (
                    <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 rounded-lg">
                      <Building2 className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="text-xs font-medium text-neutral-700">
                        {sellerOrganization.orgCode}
                      </span>
                      {distributorOrganization && (
                        <>
                          <ArrowRight className="h-3 w-3 text-neutral-400" />
                          <span className="text-xs font-medium text-neutral-700">
                            {distributorOrganization.orgCode}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Help */}
                  <button
                    className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="Help"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>

                  {/* User Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className={cn(
                        'flex items-center gap-2 p-1.5 rounded-lg transition-colors',
                        showUserMenu ? 'bg-neutral-100' : 'hover:bg-neutral-100'
                      )}
                    >
                      <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-primary-600" />
                      </div>
                      <div className="hidden md:block text-left max-w-[120px]">
                        <p className="text-xs font-medium text-neutral-900 truncate">
                          {apiId || 'User'}
                        </p>
                      </div>
                      <ChevronDown className={cn(
                        'h-3.5 w-3.5 text-neutral-400 transition-transform',
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
                        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-neutral-200 py-2 z-20">
                          {/* User Info Section */}
                          <div className="px-4 py-3 border-b border-neutral-100">
                            <p className="text-sm font-semibold text-neutral-900">
                              {apiId}
                            </p>
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {credentials?.domain || 'NDC API User'}
                            </p>
                          </div>

                          {/* Session Info */}
                          <div className="px-4 py-3 border-b border-neutral-100 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-neutral-500">Environment</span>
                              <span className={cn(
                                'text-xs font-medium px-2 py-0.5 rounded',
                                environment === 'PROD'
                                  ? 'bg-error-100 text-error-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              )}>
                                {environment}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-xs text-neutral-500">Token Status</span>
                              <span className={cn(
                                'text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1',
                                tokenStatus.color
                              )}>
                                <Clock className="h-3 w-3" />
                                {formatTimeRemaining(timeRemaining)}
                              </span>
                            </div>

                            {sellerOrganization && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-neutral-500">Seller</span>
                                <span className="text-xs font-medium text-neutral-700">
                                  {sellerOrganization.orgCode}
                                </span>
                              </div>
                            )}

                            {distributorOrganization && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-neutral-500">Distributor</span>
                                <span className="text-xs font-medium text-neutral-700">
                                  {distributorOrganization.orgCode}
                                </span>
                              </div>
                            )}

                            {bookingType && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-neutral-500">Mode</span>
                                <span className="text-xs font-medium text-neutral-700">
                                  {bookingType === 'BOB' ? 'Book on Behalf' : 'Direct'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setShowUserMenu(false);
                                navigate('/settings');
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                            >
                              <Settings className="h-4 w-4 text-neutral-400" />
                              Settings
                            </button>
                            <button
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error-600 hover:bg-error-50 transition-colors"
                            >
                              <LogOut className="h-4 w-4" />
                              Sign Out
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
