import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/core/context/SessionStore';
import { login, airlineProfile } from '@/lib/ndc-api';
import { TransactionLogger } from '@/lib/transaction-logger';
import { Lock, Key, User, Server, ChevronRight, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import testCredentialsData from '@/config/test-credentials.json';

const STORAGE_KEY = 'ndc-saved-credentials';

// Test credentials interface
interface TestCredential {
  label: string;
  domain: string;
  apiId: string;
  password: string;
  subscriptionKey: string;
  environment: 'UAT' | 'PROD';
  orgCode?: string;
  orgName?: string;
}

interface TestCredentials {
  testCredentials: {
    direct: TestCredential;
    bob: TestCredential;
  };
  warning: string;
}

// Load test credentials (if available)
function loadTestCredentials(): TestCredentials | null {
  try {
    // Validate that credentials are configured
    if (!testCredentialsData?.testCredentials?.direct?.apiId && !testCredentialsData?.testCredentials?.bob?.apiId) {
      console.log('[Login] Test credentials file exists but is not configured');
      return null;
    }

    return testCredentialsData as TestCredentials;
  } catch (error) {
    // File doesn't exist or couldn't be loaded - this is normal for prod
    console.log('[Login] Test credentials not available:', error);
    return null;
  }
}

function getSavedCredentials() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveCredentials(credentials: { domain: string; apiId: string; password: string; subscriptionKey: string; environment: string; orgCode?: string; orgName?: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

function clearSavedCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth, setAirlineRoutes, setAirlineRoutesLoading, setSellerOrganization } = useSessionStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [testCreds, setTestCreds] = useState<TestCredentials | null>(null);
  const [useTestCreds, setUseTestCreds] = useState(false);
  const [selectedCredType, setSelectedCredType] = useState<'direct' | 'bob'>('direct');

  const [form, setForm] = useState({
    environment: 'UAT' as 'UAT' | 'PROD',
    domain: 'EXT',
    apiId: '',
    password: '',
    subscriptionKey: '',
    orgCode: '',
    orgName: '',
  });

  // PROD is now enabled with proper backend support
  const isProdDisabled = false;

  useEffect(() => {
    sessionStorage.removeItem('ndc-xml-captures');
    sessionStorage.removeItem('ndc-correlation-id');
    sessionStorage.removeItem('ndc-sequence-number');

    // Load test credentials
    const loaded = loadTestCredentials();
    setTestCreds(loaded);

    const saved = getSavedCredentials();
    if (saved) {
      setForm(prev => ({
        ...prev,
        domain: saved.domain || 'EXT',
        apiId: saved.apiId || '',
        password: saved.password || '',
        subscriptionKey: saved.subscriptionKey || '',
        environment: saved.environment || 'UAT',
        orgCode: saved.orgCode || '',
        orgName: saved.orgName || '',
      }));
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProdDisabled) return;

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║ [Login] 🔐 LOGIN ATTEMPT STARTED                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('[Login] Credentials:', {
      domain: form.domain,
      apiId: form.apiId,
      environment: form.environment,
      subscriptionKey: form.subscriptionKey?.substring(0, 8) + '...',
    });

    setError('');
    setIsLoading(true);

    try {
      console.log('[Login] Calling login API...');
      const response = await login(form);
      console.log('[Login] ✅ Login successful:', {
        hasToken: !!response.token,
        tokenLength: response.token?.length,
        expiresIn: response.expiresIn,
        environment: response.environment,
      });

      const expiresIn = response.expires_in || 1800;
      const tokenExpiry = Date.now() + (expiresIn * 1000);

      const authSession = {
        token: response.token,
        tokenExpiry,
        expiresIn,
        environment: form.environment,
      };

      console.log('[Login] Setting auth session in store...');
      setAuth(authSession, form);
      console.log('[Login] Initializing transaction logger...');
      TransactionLogger.initSession(form.apiId);

      if (rememberMe) {
        console.log('[Login] Saving credentials to localStorage...');
        saveCredentials({
          domain: form.domain,
          apiId: form.apiId,
          password: form.password,
          subscriptionKey: form.subscriptionKey,
          environment: form.environment,
          orgCode: form.orgCode,
          orgName: form.orgName,
        });
      } else {
        console.log('[Login] Clearing saved credentials...');
        clearSavedCredentials();
      }

      // Fetch airline routes in the background (don't block navigation)
      console.log('[Login] Fetching airline profile in background...');
      setAirlineRoutesLoading(true);
      airlineProfile({
        ownerCode: 'JQ', // Jetstar owner code
        distributionChain: {
          links: [{
            ordinal: 1,
            orgRole: 'Seller',
            orgId: form.apiId,
          }]
        }
      }).then((response) => {
        console.log('[Login] Airline profile response:', {
          success: response.success,
          hasData: !!response.data,
          hasPairs: !!response.data?.originDestinationPairs,
          pairCount: response.data?.originDestinationPairs?.length || 0,
        });
        if (response.success && response.data?.originDestinationPairs) {
          setAirlineRoutes(response.data.originDestinationPairs);
          console.log('[Login] ✅ Loaded', response.data.originDestinationPairs.length, 'airline routes');
        } else {
          console.warn('[Login] ⚠️ Profile response missing originDestinationPairs:', response);
        }
      }).catch((err) => {
        console.error('╔═══════════════════════════════════════════════════════════════╗');
        console.error('║ [Login] ❌ AIRLINE PROFILE FAILED                             ║');
        console.error('╚═══════════════════════════════════════════════════════════════╝');
        console.error('[Login] Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
          stack: err.stack,
        });
        // Don't show error to user - routes are optional enhancement
      }).finally(() => {
        console.log('[Login] Airline profile loading finished');
        setAirlineRoutesLoading(false);
      });

      console.log('[Login] Navigating to /dashboard...');
      navigate('/dashboard');
      console.log('[Login] ✅ Login flow completed successfully');
    } catch (err: any) {
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║ [Login] ❌ LOGIN FAILED                                       ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('[Login] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        stack: err.stack,
        config: {
          url: err.config?.url,
          method: err.config?.method,
          headers: err.config?.headers,
        }
      });
      const errorMessage = err.response?.data?.error?.message || err.message || 'Authentication failed';
      console.error('[Login] Setting error message:', errorMessage);
      setError(errorMessage);
    } finally {
      console.log('[Login] Clearing loading state');
      setIsLoading(false);
    }
  };

  const updateForm = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  // Auto-populate test credentials
  const populateTestCredentials = (type: 'direct' | 'bob') => {
    if (!testCreds) return;

    const cred = testCreds.testCredentials[type];
    setForm({
      environment: cred.environment,
      domain: cred.domain,
      apiId: cred.apiId,
      password: cred.password,
      subscriptionKey: cred.subscriptionKey,
      orgCode: cred.orgCode || '',
      orgName: cred.orgName || '',
    });
    setRememberMe(true);

    // Store organization details in session if available
    if (cred.orgCode && cred.orgName) {
      setSellerOrganization({
        orgCode: cred.orgCode,
        orgName: cred.orgName,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-4">
          <img
            src="/Jetstar-logo.png"
            alt="Jetstar"
            className="w-80 mx-auto -my-4"
          />
          <h1 className="text-2xl font-bold text-slate-900">NDC API Sandbox</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Environment Toggle */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Environment</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, environment: 'UAT' }))}
                  className={cn(
                    'py-2.5 text-sm font-semibold rounded-lg border-2 transition-all',
                    form.environment === 'UAT'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  )}
                >
                  UAT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(prev => ({ ...prev, environment: 'PROD' }));
                    setUseTestCreds(false); // Hide test credentials when switching to PROD
                  }}
                  className={cn(
                    'py-2.5 text-sm font-semibold rounded-lg border-2 transition-all',
                    form.environment === 'PROD'
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  )}
                >
                  PROD
                </button>
              </div>

              {/* PROD Warning - informational only */}
              {form.environment === 'PROD' && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">You are connecting to the <strong>PRODUCTION</strong> environment. All bookings will be real.</p>
                </div>
              )}

              {/* Use Test Credentials Checkbox - Only shown in UAT when test creds are available */}
              {form.environment === 'UAT' && testCreds && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none mt-3">
                  <input
                    type="checkbox"
                    checked={useTestCreds}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseTestCreds(checked);

                      if (checked) {
                        // Auto-populate with whichever credential is available
                        // Priority: direct first, then bob
                        const hasDirectCreds = !!testCreds.testCredentials.direct.apiId;
                        const hasBobCreds = !!testCreds.testCredentials.bob.apiId;

                        if (hasDirectCreds) {
                          populateTestCredentials('direct');
                        } else if (hasBobCreds) {
                          populateTestCredentials('bob');
                        }
                      } else {
                        // Clear form when unchecked
                        setForm({
                          environment: 'UAT',
                          domain: 'EXT',
                          apiId: '',
                          password: '',
                          subscriptionKey: '',
                          orgCode: '',
                          orgName: '',
                        });
                        setRememberMe(false);
                        // Clear stored organization details
                        setSellerOrganization(null);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-blue-500" />
                    Use TEST preconfigured credentials
                  </span>
                </label>
              )}
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Domain</label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="EXT"
                      value={form.domain}
                      onChange={updateForm('domain')}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all text-sm"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">API ID</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="APINDCITG01"
                      value={form.apiId}
                      onChange={updateForm('apiId')}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all text-sm"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={updateForm('password')}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Subscription Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Ocp-Apim-Subscription-Key"
                    value={form.subscriptionKey}
                    onChange={updateForm('subscriptionKey')}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all font-mono text-sm"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Remember Me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-600">Remember my credentials</span>
            </label>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || isProdDisabled}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-6">
          Internal Development Tool • v2.0
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
