import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { Plane, ArrowRight, Download } from 'lucide-react';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'error'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
    isLoading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'Book Now',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Learn More',
    variant: 'secondary',
  },
};

export const Outline: Story = {
  args: {
    children: 'Cancel',
    variant: 'outline',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Skip',
    variant: 'ghost',
  },
};

export const Error: Story = {
  args: {
    children: 'Delete',
    variant: 'error',
  },
};

export const WithLeftIcon: Story = {
  args: {
    children: 'Search Flights',
    variant: 'primary',
    leftIcon: <Plane className="h-4 w-4" />,
  },
};

export const WithRightIcon: Story = {
  args: {
    children: 'Continue',
    variant: 'primary',
    rightIcon: <ArrowRight className="h-4 w-4" />,
  },
};

export const Loading: Story = {
  args: {
    children: 'Processing...',
    variant: 'primary',
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Unavailable',
    variant: 'primary',
    disabled: true,
  },
};

export const Small: Story = {
  args: {
    children: 'Small',
    variant: 'primary',
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    children: 'Large Button',
    variant: 'primary',
    size: 'lg',
  },
};

export const FullWidth: Story = {
  args: {
    children: 'Pay $299.00 AUD',
    variant: 'primary',
    className: 'w-full',
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};
