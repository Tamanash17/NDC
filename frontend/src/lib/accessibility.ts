import { useEffect, useRef, useCallback } from 'react';

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}

export function useAnnouncer() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const el = document.getElementById('sr-announcer') || createAnnouncer();
    el.setAttribute('aria-live', priority);
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 1000);
  }, []);

  return { announce };
}

function createAnnouncer(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'sr-announcer';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'sr-only';
  document.body.appendChild(el);
  return el;
}

export function createSkipLink(targetId: string = 'main-content'): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = '#' + targetId;
  link.className = 'sr-only';
  link.textContent = 'Skip to main content';
  return link;
}

export function useKeyboardNavigation(
  items: HTMLElement[],
  options: { orientation?: 'horizontal' | 'vertical'; loop?: boolean } = {}
) {
  const { orientation = 'vertical', loop = true } = options;
  const currentIndex = useRef(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    let newIndex = currentIndex.current;

    switch (e.key) {
      case prevKey:
        e.preventDefault();
        newIndex = currentIndex.current - 1;
        if (newIndex < 0) newIndex = loop ? items.length - 1 : 0;
        break;
      case nextKey:
        e.preventDefault();
        newIndex = currentIndex.current + 1;
        if (newIndex >= items.length) newIndex = loop ? 0 : items.length - 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = items.length - 1;
        break;
      default:
        return;
    }

    currentIndex.current = newIndex;
    items[newIndex]?.focus();
  }, [items, orientation, loop]);

  return { handleKeyDown, currentIndex };
}

export function usePrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}


export function SkipLink() { return null; }
