import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { type ReactElement, type ReactNode } from 'react';
import { ToastProvider } from '@/core/context/ToastContext';
import { XmlViewerProvider } from '@/core/context/XmlViewerContext';

// All providers wrapper
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <XmlViewerProvider>
          {children}
        </XmlViewerProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

// Custom render with providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
