type EventCategory = 'booking' | 'navigation' | 'interaction' | 'error' | 'performance';

interface AnalyticsEvent {
  category: EventCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
}

interface PageView {
  path: string;
  title: string;
  referrer?: string;
}

class AnalyticsService {
  private isEnabled: boolean;
  private userId?: string;
  private sessionId: string;
  private queue: AnalyticsEvent[] = [];

  constructor() {
    this.isEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';
    this.sessionId = this.generateSessionId();
    
    // Process queue on page unload
    window.addEventListener('beforeunload', () => this.flush());
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  clearUserId() {
    this.userId = undefined;
  }

  trackPageView(pageView: PageView) {
    if (!this.isEnabled) {
      console.debug('[Analytics] Page view:', pageView);
      return;
    }

    this.send('pageview', {
      path: pageView.path,
      title: pageView.title,
      referrer: pageView.referrer || document.referrer,
    });
  }

  trackEvent(event: AnalyticsEvent) {
    if (!this.isEnabled) {
      console.debug('[Analytics] Event:', event);
      return;
    }

    this.queue.push(event);
    
    // Flush if queue is getting large
    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  // Booking-specific events
  trackBookingStarted(scenario: string) {
    this.trackEvent({
      category: 'booking',
      action: 'started',
      label: scenario,
    });
  }

  trackStepCompleted(stepName: string, duration: number) {
    this.trackEvent({
      category: 'booking',
      action: 'step_completed',
      label: stepName,
      value: duration,
    });
  }

  trackBookingCompleted(pnr: string, totalAmount: number) {
    this.trackEvent({
      category: 'booking',
      action: 'completed',
      label: pnr,
      value: totalAmount,
    });
  }

  trackBookingAbandoned(step: string) {
    this.trackEvent({
      category: 'booking',
      action: 'abandoned',
      label: step,
    });
  }

  trackFlightSelected(flightNumber: string, bundleName: string) {
    this.trackEvent({
      category: 'booking',
      action: 'flight_selected',
      label: `${flightNumber} - ${bundleName}`,
    });
  }

  trackError(error: Error, context?: string) {
    this.trackEvent({
      category: 'error',
      action: error.name,
      label: context,
      metadata: {
        message: error.message,
        stack: error.stack,
      },
    });
  }

  private async send(type: string, data: Record<string, any>) {
    const payload = {
      type,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      ...data,
    };

    // In production, send to analytics endpoint
    if (import.meta.env.PROD) {
      try {
        await fetch('/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch (error) {
        console.error('[Analytics] Failed to send:', error);
      }
    } else {
      console.debug('[Analytics] Would send:', payload);
    }
  }

  private flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    events.forEach((event) => {
      this.send('event', event);
    });
  }
}

export const analytics = new AnalyticsService();
