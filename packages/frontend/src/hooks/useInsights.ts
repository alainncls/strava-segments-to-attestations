import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { INSIGHTS_ID } from '../utils/constants';

declare global {
  interface Window {
    insights?: {
      init: (projectId: string) => void;
      trackPages: () => void;
      track: (event: string, params?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Hook to initialize getinsights.io analytics
 * @see https://getinsights.io/
 */
export function useInsights(): void {
  const location = useLocation();

  // Initialize insights on mount
  useEffect(() => {
    if (!INSIGHTS_ID || typeof window === 'undefined') return;

    // Check if script is already loaded
    if (window.insights) {
      return;
    }

    // Load the insights script
    const script = document.createElement('script');
    script.src = 'https://getinsights.io/js/insights.js';
    script.async = true;
    script.onload = (): void => {
      if (window.insights) {
        window.insights.init(INSIGHTS_ID);
        window.insights.trackPages();
      }
    };
    document.head.appendChild(script);

    return (): void => {
      // Cleanup if needed
    };
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!INSIGHTS_ID || !window.insights) return;
    // trackPages() handles this automatically
  }, [location.pathname]);
}

/**
 * Track a custom event
 */
export function trackEvent(event: string, params?: Record<string, unknown>): void {
  if (!INSIGHTS_ID || !window.insights) return;
  window.insights.track(event, params);
}
