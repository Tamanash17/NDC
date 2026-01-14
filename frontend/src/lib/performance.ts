interface PerformanceMetrics {
  fcp: number | null;  // First Contentful Paint
  lcp: number | null;  // Largest Contentful Paint
  fid: number | null;  // First Input Delay
  cls: number | null;  // Cumulative Layout Shift
  ttfb: number | null; // Time to First Byte
}

type MetricName = keyof PerformanceMetrics;

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null,
  };

  private observers: PerformanceObserver[] = [];
  private onMetricCallbacks: ((name: MetricName, value: number) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.initObservers();
    }
  }

  private initObservers() {
    // First Contentful Paint
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcp = entries.find((e) => e.name === 'first-contentful-paint');
        if (fcp) {
          this.recordMetric('fcp', fcp.startTime);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
      this.observers.push(fcpObserver);
    } catch (e) {
      console.debug('FCP observer not supported');
    }

    // Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.recordMetric('lcp', lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(lcpObserver);
    } catch (e) {
      console.debug('LCP observer not supported');
    }

    // First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstInput = entries[0] as PerformanceEventTiming;
        if (firstInput) {
          this.recordMetric('fid', firstInput.processingStart - firstInput.startTime);
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      this.observers.push(fidObserver);
    } catch (e) {
      console.debug('FID observer not supported');
    }

    // Cumulative Layout Shift
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        this.recordMetric('cls', clsValue);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(clsObserver);
    } catch (e) {
      console.debug('CLS observer not supported');
    }

    // Time to First Byte
    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navEntry) {
        this.recordMetric('ttfb', navEntry.responseStart - navEntry.requestStart);
      }
    } catch (e) {
      console.debug('TTFB measurement not supported');
    }
  }

  private recordMetric(name: MetricName, value: number) {
    this.metrics[name] = Math.round(value);
    this.onMetricCallbacks.forEach((cb) => cb(name, value));
    
    // Log in development
    if (import.meta.env.DEV) {
      console.debug(`[Performance] ${name.toUpperCase()}: ${value.toFixed(2)}ms`);
    }
  }

  onMetric(callback: (name: MetricName, value: number) => void) {
    this.onMetricCallbacks.push(callback);
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getVitalsRating(): Record<MetricName, 'good' | 'needs-improvement' | 'poor' | 'unknown'> {
    const thresholds = {
      fcp: { good: 1800, poor: 3000 },
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      ttfb: { good: 800, poor: 1800 },
    };

    const ratings: Record<MetricName, 'good' | 'needs-improvement' | 'poor' | 'unknown'> = {
      fcp: 'unknown',
      lcp: 'unknown',
      fid: 'unknown',
      cls: 'unknown',
      ttfb: 'unknown',
    };

    (Object.keys(this.metrics) as MetricName[]).forEach((metric) => {
      const value = this.metrics[metric];
      if (value === null) {
        ratings[metric] = 'unknown';
      } else if (value <= thresholds[metric].good) {
        ratings[metric] = 'good';
      } else if (value <= thresholds[metric].poor) {
        ratings[metric] = 'needs-improvement';
      } else {
        ratings[metric] = 'poor';
      }
    });

    return ratings;
  }

  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();
