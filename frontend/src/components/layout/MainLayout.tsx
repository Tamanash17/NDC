import { Header } from './Header';
import { cn } from '@/lib/cn';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  fullWidth?: boolean;
}

export function MainLayout({ children, sidebar, fullWidth = false }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      
      <main className={cn(
        'mx-auto py-6 px-4 sm:px-6 lg:px-8',
        fullWidth ? 'max-w-screen-2xl' : 'max-w-screen-xl'
      )}>
        {sidebar ? (
          <div className="flex gap-6">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              {children}
            </div>
            
            {/* Sidebar */}
            <div className="hidden lg:block w-80 shrink-0">
              {sidebar}
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
