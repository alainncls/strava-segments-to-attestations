import { useEffect } from 'react';
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
  useEffect(() => {
    if (!INSIGHTS_ID || typeof window === 'undefined') return;

    if (window.insights) {
      return;
    }

    let script: HTMLScriptElement | undefined;
    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;

    const loadInsights = (): void => {
      script = document.createElement('script');
      script.src = 'https://getinsights.io/js/insights.js';
      script.async = true;
      script.onload = (): void => {
        if (window.insights) {
          window.insights.init(INSIGHTS_ID);
          window.insights.trackPages();
        }
      };
      document.head.appendChild(script);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      idleCallbackId = idleWindow.requestIdleCallback(loadInsights);
    } else {
      timeoutId = window.setTimeout(loadInsights, 0);
    }

    return (): void => {
      if (idleCallbackId !== undefined) {
        idleWindow.cancelIdleCallback?.(idleCallbackId);
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      script?.remove();
    };
  }, []);
}

/**
 * Track a custom event
 */
export function trackEvent(event: string, params?: Record<string, unknown>): void {
  if (!INSIGHTS_ID || !window.insights) return;
  window.insights.track(event, params);
}
