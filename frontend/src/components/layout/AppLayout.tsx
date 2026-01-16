import { useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, useWizardSession, useSessionStore } from '@/core/context/SessionStore';
import { cn } from '@/lib/cn';
import { setEnvironment, type NDCEnvironment } from '@/lib/ndc-api';
import {
  Plane,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Building2,
  ArrowRight,
  RefreshCw,
  User,
  LogOut,
  ChevronDown,
  Home,
  Settings
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
  if (remainingMs < 60000) return { status: 'critical', color: 'text-red-600', bgColor: 'bg-red-50' };
  if (remainingMs < 300000) return { status: 'warning', color: 'text-amber-600', bgColor: 'bg-amber-50' };
  return { status: 'healthy', color: 'text-emerald-600', bgColor: 'bg-emerald-50' };
}

interface AppLayoutProps {
  children: ReactNode;
  /** Page title shown in breadcrumb */
  title?: string;
  /** Show back button (default: true, except for dashboard) */
  showBack?: boolean;
  /** Custom back handler (default: navigate to previous page or dashboard) */
  onBack?: () => void;
  /** Where back button navigates to (default: auto-detect) */
  backTo?: string;
  /** Show progress steps bar */
  progressBar?: ReactNode;
  /** Full width content (no max-width constraint) */
  fullWidth?: boolean;
  /** Custom max-width class */
  maxWidth?: string;
  /** Show sidebar */
  sidebar?: ReactNode;
  /** Footer content */
  footer?: ReactNode;
}

export function AppLayout({
  children,
  title,
  showBack = true,
  onBack,
  backTo,
  progressBar,
  fullWidth = false,
  maxWidth = 'max-w-5xl',
  sidebar,
  footer
}: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, credentials, environment, logout } = useSession();
  const { bookingType, sellerOrganization, distributorOrganization, operationType } = useWizardSession();

  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showSessionExpiredBanner, setShowSessionExpiredBanner] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [switchingEnv, setSwitchingEnv] = useState(false);

  // Determine if we're on dashboard (no back button needed)
  const isDashboard = location.pathname === '/dashboard';

  // Update time remaining every second
  useEffect(() => {
    if (!auth?.tokenExpiry) {
      setTimeRemaining(0);
      return;
    }

    const updateTime = () => {
      const remaining = auth.tokenExpiry - Date.now();
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setShowSessionExpiredBanner(true);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [auth?.tokenExpiry]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      // Auto-detect back destination
      if (location.pathname.startsWith('/booking')) {
        navigate('/wizard?mode=prime');
      } else if (location.pathname.startsWith('/manage')) {
        navigate('/wizard?mode=servicing');
      } else if (location.pathname === '/wizard') {
        navigate('/dashboard');
      } else {
        navigate('/dashboard');
      }
    }
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate('/login');
  };

  const handleReLogin = () => {
    // Clear XML captures when session expires
    sessionStorage.removeItem('ndc-xml-captures');
    sessionStorage.removeItem('ndc-correlation-id');
    sessionStorage.removeItem('ndc-sequence-number');

    setShowSessionExpiredBanner(false);
    navigate('/login');
  };

  const handleEnvSwitch = async (newEnv: NDCEnvironment) => {
    if (newEnv === environment || switchingEnv) return;

    setSwitchingEnv(true);
    try {
      const result = await setEnvironment(newEnv);
      if (result.success) {
        // Update local session store
        useSessionStore.getState().setEnvironment(newEnv);
        console.log(`[ENV] Switched to ${newEnv}:`, result);
      }
    } catch (err) {
      console.error('[ENV] Switch failed:', err);
    } finally {
      setSwitchingEnv(false);
      setShowEnvDropdown(false);
    }
  };

  const tokenStatus = getTokenStatus(timeRemaining);
  const apiId = credentials?.apiId || '';

  // Determine context label
  const getContextLabel = () => {
    if (operationType === 'PRIME') return 'Prime';
    if (operationType === 'SERVICING') return 'Servicing';
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
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

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className={cn('mx-auto px-6', fullWidth ? 'max-w-full' : maxWidth)}>
          <div className="flex items-center justify-between h-14">
            {/* Left: Back Button + Logo + Breadcrumb */}
            <div className="flex items-center gap-2">
              {/* Back Button */}
              {showBack && !isDashboard && (
                <>
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Go Back"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <div className="h-6 w-px bg-slate-200 mx-1" />
                </>
              )}

              {/* Logo */}
              <div
                className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/dashboard')}
              >
                <img
                  src="/Jetstar-logo.png"
                  alt="Jetstar"
                  className="h-14 w-auto -my-2"
                />
              </div>

              {/* Breadcrumb */}
              {(title || getContextLabel()) && (
                <div className="hidden md:flex items-center gap-2 ml-2">
                  <span className="text-slate-300">/</span>
                  {getContextLabel() && (
                    <>
                      <span className="text-sm text-slate-500">{getContextLabel()}</span>
                      {title && <span className="text-slate-300">/</span>}
                    </>
                  )}
                  {title && (
                    <span className="text-sm font-medium text-slate-700">{title}</span>
                  )}
                </div>
              )}
            </div>

            {/* Center: Environment Badge with Dropdown */}
            <div className="absolute left-1/2 transform -translate-x-1/2 relative">
              <button
                onClick={() => setShowEnvDropdown(!showEnvDropdown)}
                disabled={switchingEnv}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all hover:shadow-md',
                  environment === 'PROD'
                    ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200',
                  switchingEnv && 'opacity-50'
                )}
              >
                {switchingEnv ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <span className={cn(
                    'w-2 h-2 rounded-full animate-pulse',
                    environment === 'PROD' ? 'bg-red-500' : 'bg-emerald-500'
                  )} />
                )}
                {environment}
                <ChevronDown className={cn('w-3 h-3 transition-transform', showEnvDropdown && 'rotate-180')} />
              </button>

              {/* Environment Dropdown */}
              {showEnvDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowEnvDropdown(false)}
                  />
                  <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20 min-w-[140px]">
                    <button
                      onClick={() => handleEnvSwitch('UAT')}
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                        environment === 'UAT'
                          ? 'bg-emerald-50 text-emerald-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      UAT
                      {environment === 'UAT' && <span className="ml-auto text-emerald-500">✓</span>}
                    </button>
                    <button
                      onClick={() => handleEnvSwitch('PROD')}
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                        environment === 'PROD'
                          ? 'bg-red-50 text-red-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      PROD
                      {environment === 'PROD' && <span className="ml-auto text-red-500">✓</span>}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Right: Session Info & User Menu */}
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
                <span className="font-mono">{formatTimeRemaining(timeRemaining)}</span>
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
              {bookingType && (
                <div className="hidden sm:flex items-center px-2.5 py-1 bg-slate-100 rounded-lg">
                  <span className="text-xs font-medium text-slate-600">
                    {bookingType === 'BOB' ? 'BOB' : 'Direct'}
                  </span>
                </div>
              )}

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded-lg transition-colors',
                    showUserMenu ? 'bg-slate-100' : 'hover:bg-slate-100'
                  )}
                >
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-orange-600" />
                  </div>
                  <span className="hidden md:inline text-sm font-medium text-slate-700 max-w-[100px] truncate">
                    {apiId}
                  </span>
                  <ChevronDown className={cn(
                    'h-4 w-4 text-slate-400 transition-transform',
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
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-20">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-900">{apiId}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{credentials?.domain || 'NDC API User'}</p>
                      </div>

                      {/* Session Details */}
                      <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Environment</span>
                          <span className={cn(
                            'text-xs font-semibold px-2 py-0.5 rounded',
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

                        {bookingType && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Mode</span>
                            <span className="text-xs font-medium text-slate-700">
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
                            navigate('/dashboard');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Home className="h-4 w-4 text-slate-400" />
                          Dashboard
                        </button>
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

      {/* Progress Bar (optional) */}
      {progressBar && (
        <div className="bg-white border-b border-slate-200">
          {progressBar}
        </div>
      )}

      {/* Main Content */}
      <main className={cn(
        'flex-1 mx-auto px-6 py-8 w-full',
        fullWidth ? 'max-w-full' : maxWidth,
        footer ? 'pb-24' : ''
      )}>
        {sidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {children}
            </div>
            <div className="space-y-6">
              {sidebar}
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Footer (optional - fixed at bottom) */}
      {footer && (
        <div className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 shadow-lg z-40">
          <div className={cn('mx-auto px-6 py-4', fullWidth ? 'max-w-full' : maxWidth)}>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

export default AppLayout;
