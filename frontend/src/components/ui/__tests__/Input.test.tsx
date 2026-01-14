import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { Input } from '@/components/ui';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<Input label="Name" onChange={handleChange} />);
    
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'John' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('shows error message', () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(<Input label="Email" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders with left icon', () => {
    render(
      <Input 
        label="Search" 
        leftIcon={<span data-testid="search-icon">🔍</span>} 
      />
    );
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });
});
