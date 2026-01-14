import { Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from '@/core/context/SessionStore';
import { XmlViewerProvider } from '@/core/context/XmlViewerContext';
import { ToastProvider } from '@/core/context/ToastContext';
import { XmlViewerModal, XmlLogPanel } from '@/components/debug';
import { ToastContainer } from '@/components/feedback';
import { ErrorBoundary } from '@/components/feedback';
import { PwaInstallPrompt, OfflineBanner } from '@/components/pwa';
import { SkipLink } from '@/lib/accessibility';

// i18n initialization
import '@/i18n';

// Pages
import { LoginPage, DashboardPage, WizardPage, BookingPage, ManageBookingPage } from '@/pages';
import { PaymentPage } from '@/pages/PaymentPage';

// Loading fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSession();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Wrapper component to manage XmlLogPanel state
function AppWithXmlLogPanel() {
  const [isXmlLogOpen, setIsXmlLogOpen] = useState(false);

  return (
    <>
      <SkipLink />
      <OfflineBanner />

      {/* Main content */}
      <main id="main-content">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } />

          <Route path="/wizard" element={
            <ProtectedRoute>
              <WizardPage />
            </ProtectedRoute>
          } />

          <Route path="/booking" element={
            <ProtectedRoute>
              <BookingPage />
            </ProtectedRoute>
          } />

          <Route path="/booking/:scenarioId" element={
            <ProtectedRoute>
              <BookingPage />
            </ProtectedRoute>
          } />

          {/* Payment Page */}
          <Route path="/payment" element={
            <ProtectedRoute>
              <PaymentPage />
            </ProtectedRoute>
          } />

          {/* Manage Booking Routes */}
          <Route path="/manage" element={
            <ProtectedRoute>
              <ManageBookingPage />
            </ProtectedRoute>
          } />

          <Route path="/booking/manage/:action" element={
            <ProtectedRoute>
              <BookingPage />
            </ProtectedRoute>
          } />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Global Components */}
      <XmlViewerModal />
      <XmlLogPanel
        isOpen={isXmlLogOpen}
        onClose={() => setIsXmlLogOpen(false)}
        onToggle={() => setIsXmlLogOpen(!isXmlLogOpen)}
      />
      <ToastContainer />
      <PwaInstallPrompt />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <ToastProvider>
          <XmlViewerProvider>
            <BrowserRouter>
              <AppWithXmlLogPanel />
            </BrowserRouter>
          </XmlViewerProvider>
        </ToastProvider>
      </Suspense>
    </ErrorBoundary>
  );
}
