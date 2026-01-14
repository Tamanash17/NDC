import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { Card } from '@/components/ui';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Card className="custom-class">Content</Card>);
    expect(screen.getByText('Content').parentElement).toHaveClass('custom-class');
  });

  it('renders with padding', () => {
    render(<Card className="p-4">Content</Card>);
    expect(screen.getByText('Content').parentElement).toHaveClass('p-4');
  });
});
