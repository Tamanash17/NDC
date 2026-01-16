import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TransactionLogger } from '@/lib/transaction-logger';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';

export type Environment = 'UAT' | 'PROD';

export interface NDCCredentials {
  domain: string;
  apiId: string;
  password: string;
  subscriptionKey: string;
  environment: Environment;
  orgCode?: string;
  orgName?: string;
}

export interface AuthSession {
  token: string;
  tokenExpiry: number;
  expiresIn: number;
  environment: Environment;
}

export interface Organization {
  orgCode: string;
  orgName: string;
}

// Distribution chain link for XML
export interface DistributionChainLink {
  ordinal: number;
  orgRole: string;
  orgId: string;
  orgName: string;
}

// Distribution chain context for all NDC calls
export interface DistributionContext {
  bookingType: 'DIRECT' | 'BOB';
  seller: Organization;
  distributor: Organization | null; // Only for BOB
  ownerCode: string; // Always 'JQ' for Jetstar
  links: DistributionChainLink[];
}

export interface AirlineRoute {
  origin: string;
  destination: string;
  directionalInd: string;
}

interface SessionState {
  // Auth
  auth: AuthSession | null;
  credentials: NDCCredentials | null;
  isAuthenticated: boolean;

  // Organization context for distribution chain
  sellerOrganization: Organization | null;
  distributorOrganization: Organization | null;

  // Airline routes from Airline Profile API
  airlineRoutes: AirlineRoute[] | null;
  airlineRoutesLoading: boolean;

  // Wizard state
  bookingType: 'DIRECT' | 'BOB' | null;
  operationType: 'PRIME' | 'SERVICING' | null;
  selectedScenarioId: string | null;

  // Actions - Auth
  setAuth: (auth: AuthSession, credentials: NDCCredentials) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
  setEnvironment: (env: Environment) => void;
  
  // Actions - Organization
  setSellerOrganization: (org: Organization | null) => void;
  setDistributorOrganization: (org: Organization | null) => void;

  // Actions - Airline Routes
  setAirlineRoutes: (routes: AirlineRoute[]) => void;
  setAirlineRoutesLoading: (loading: boolean) => void;
  clearAirlineRoutes: () => void;

  // Actions - Wizard
  setBookingType: (type: 'DIRECT' | 'BOB') => void;
  setOperationType: (type: 'PRIME' | 'SERVICING') => void;
  setSelectedScenario: (scenarioId: string) => void;
  clearWizard: () => void;

  // Computed - Get distribution context for API calls
  getDistributionContext: () => DistributionContext | null;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // Initial state
      auth: null,
      credentials: null,
      isAuthenticated: false,
      sellerOrganization: null,
      distributorOrganization: null,
      airlineRoutes: null,
      airlineRoutesLoading: false,
      bookingType: null,
      operationType: null,
      selectedScenarioId: null,

      // Auth actions
      setAuth: (auth, credentials) => set({ 
        auth, 
        credentials, 
        isAuthenticated: true 
      }),
      
      logout: () => {
        // End transaction logger session
        TransactionLogger.endSession();

        // Clear XML captures from sessionStorage
        sessionStorage.removeItem('ndc-xml-captures');
        sessionStorage.removeItem('ndc-correlation-id');
        sessionStorage.removeItem('ndc-sequence-number');

        // Clear flight selection store (localStorage) to prevent stale pricing data
        useFlightSelectionStore.getState().reset();

        set({
          auth: null,
          credentials: null,
          isAuthenticated: false,
          sellerOrganization: null,
          distributorOrganization: null,
          airlineRoutes: null,
          airlineRoutesLoading: false,
          bookingType: null,
          operationType: null,
          selectedScenarioId: null
        });
      },
      
      isTokenExpired: () => {
        const { auth } = get();
        if (!auth) return true;
        return Date.now() >= (auth.tokenExpiry - 30000); // 30 second buffer
      },

      setEnvironment: (env) => {
        const { auth, credentials } = get();
        if (auth) {
          set({ auth: { ...auth, environment: env } });
        }
        if (credentials) {
          set({ credentials: { ...credentials, environment: env } });
        }
        console.log('[SessionStore] Environment changed to:', env);
      },

      // Organization actions
      setSellerOrganization: (org) => {
        console.log('[SessionStore] setSellerOrganization called with:', org);
        set({ sellerOrganization: org });
        console.log('[SessionStore] After set, sellerOrganization:', get().sellerOrganization);
      },
      setDistributorOrganization: (org) => {
        console.log('[SessionStore] setDistributorOrganization called with:', org);
        set({ distributorOrganization: org });
      },

      // Airline routes actions
      setAirlineRoutes: (routes) => set({ airlineRoutes: routes }),
      setAirlineRoutesLoading: (loading) => set({ airlineRoutesLoading: loading }),
      clearAirlineRoutes: () => set({ airlineRoutes: null, airlineRoutesLoading: false }),

      // Wizard actions
      setBookingType: (type) => set({ 
        bookingType: type,
        // Clear distributor if switching to DIRECT
        distributorOrganization: type === 'DIRECT' ? null : get().distributorOrganization 
      }),
      setOperationType: (type) => set({ operationType: type }),
      setSelectedScenario: (scenarioId) => set({ selectedScenarioId: scenarioId }),
      
      clearWizard: () => set({ 
        bookingType: null, 
        operationType: null, 
        sellerOrganization: null,
        distributorOrganization: null,
        selectedScenarioId: null 
      }),

      // Get distribution context for API calls
      getDistributionContext: () => {
        const { bookingType, sellerOrganization, distributorOrganization } = get();

        if (!bookingType || !sellerOrganization) return null;

        if (bookingType === 'BOB' && !distributorOrganization) return null;

        // Build distribution chain links
        const links: DistributionChainLink[] = [];

        if (bookingType === 'DIRECT') {
          // Direct: Seller only
          links.push({
            ordinal: 1,
            orgRole: 'Seller',
            orgId: sellerOrganization.orgCode,
            orgName: sellerOrganization.orgName,
          });
        } else {
          // BOB: Seller + Distributor
          links.push({
            ordinal: 1,
            orgRole: 'Seller',
            orgId: sellerOrganization.orgCode,
            orgName: sellerOrganization.orgName,
          });
          links.push({
            ordinal: 2,
            orgRole: 'Distributor',
            orgId: distributorOrganization!.orgCode,
            orgName: distributorOrganization!.orgName,
          });
        }

        return {
          bookingType,
          seller: sellerOrganization,
          distributor: bookingType === 'BOB' ? distributorOrganization : null,
          ownerCode: 'JQ',
          links,
        };
      },
    }),
    {
      name: 'ndc-session',
      partialize: (state) => ({
        // Only persist these fields
        auth: state.auth,
        credentials: state.credentials,
        isAuthenticated: state.isAuthenticated,
        sellerOrganization: state.sellerOrganization,
        distributorOrganization: state.distributorOrganization,
        airlineRoutes: state.airlineRoutes, // Persist airline routes from Airline Profile API
        bookingType: state.bookingType,
        operationType: state.operationType,
        selectedScenarioId: state.selectedScenarioId,
      }),
    }
  )
);

// Hook for general session access
export function useSession() {
  const store = useSessionStore();
  return {
    // Auth
    auth: store.auth,
    credentials: store.credentials,
    isAuthenticated: store.isAuthenticated,
    environment: store.auth?.environment || 'UAT',
    setAuth: store.setAuth,
    logout: store.logout,
    isTokenExpired: store.isTokenExpired,
    
    // Organizations
    sellerOrganization: store.sellerOrganization,
    distributorOrganization: store.distributorOrganization,
    setSellerOrganization: store.setSellerOrganization,
    setDistributorOrganization: store.setDistributorOrganization,
    
    // Wizard state (read-only in general session)
    bookingType: store.bookingType,
    operationType: store.operationType,
    selectedScenarioId: store.selectedScenarioId,
    
    // Distribution context for API calls
    getDistributionContext: store.getDistributionContext,
  };
}

// Hook specifically for wizard operations
export function useWizardSession() {
  const store = useSessionStore();
  return {
    // Current state
    bookingType: store.bookingType,
    operationType: store.operationType,
    sellerOrganization: store.sellerOrganization,
    distributorOrganization: store.distributorOrganization,
    selectedScenarioId: store.selectedScenarioId,
    
    // Actions
    setBookingType: store.setBookingType,
    setOperationType: store.setOperationType,
    setSellerOrganization: store.setSellerOrganization,
    setDistributorOrganization: store.setDistributorOrganization,
    setSelectedScenario: store.setSelectedScenario,
    clearWizard: store.clearWizard,
    
    // Distribution context
    getDistributionContext: store.getDistributionContext,
  };
}

// Hook for API calls - provides the distribution context
// Properly subscribes to Zustand state changes
export function useDistributionContext() {
  // Subscribe to specific state values to trigger re-renders when they change
  const bookingType = useSessionStore((state) => state.bookingType);
  const sellerOrganization = useSessionStore((state) => state.sellerOrganization);
  const distributorOrganization = useSessionStore((state) => state.distributorOrganization);

  // Debug log every time this hook re-renders
  console.log('[useDistributionContext] Hook re-render:', {
    bookingType,
    sellerOrganization,
    distributorOrganization,
  });

  // Compute context from subscribed state
  const isValid = !!bookingType && !!sellerOrganization &&
    (bookingType === 'DIRECT' || !!distributorOrganization);

  console.log('[useDistributionContext] isValid:', isValid);

  const seller = sellerOrganization;
  const distributor = distributorOrganization;

  return {
    isValid,
    bookingType: bookingType || null,
    seller: seller || null,
    distributor: distributor || null,

    // Helper to build Party element for XML
    getPartyConfig: () => {
      console.log('[useDistributionContext] getPartyConfig called, isValid:', isValid, 'sellerOrganization:', sellerOrganization);
      if (!isValid || !sellerOrganization) return null;

      if (bookingType === 'DIRECT') {
        return {
          participants: [
            { ordinal: 1, role: 'Seller', orgCode: sellerOrganization.orgCode, orgName: sellerOrganization.orgName }
          ]
        };
      } else {
        return {
          participants: [
            { ordinal: 1, role: 'Seller', orgCode: sellerOrganization.orgCode, orgName: sellerOrganization.orgName },
            { ordinal: 2, role: 'Distributor', orgCode: distributorOrganization!.orgCode, orgName: distributorOrganization!.orgName }
          ]
        };
      }
    },
  };
}