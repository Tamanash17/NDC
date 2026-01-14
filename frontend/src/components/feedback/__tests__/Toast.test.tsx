import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { useToast, ToastProvider } from '@/core/context/ToastContext';
import { ToastContainer } from '@/components/feedback';

// Test component that uses toast
function TestComponent() {
  const toast = useToast();
  
  return (
    <div>
      <button onClick={() => toast.success('Success', 'Operation completed')}>
        Show Success
      </button>
      <button onClick={() => toast.error('Error', 'Something went wrong')}>
        Show Error
      </button>
    </div>
  );
}

describe('Toast System', () => {
  it('shows success toast', async () => {
    render(
      <ToastProvider>
        <TestComponent />
        <ToastContainer />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Success'));
    
    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed')).toBeInTheDocument();
    });
  });

  it('shows error toast', async () => {
    render(
      <ToastProvider>
        <TestComponent />
        <ToastContainer />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Error'));
    
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('removes toast when close button is clicked', async () => {
    render(
      <ToastProvider>
        <TestComponent />
        <ToastContainer />
      </ToastProvider>
    );
    
    fireEvent.click(screen.getByText('Show Success'));
    
    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
    
    // Find and click close button
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
    });
  });
});
