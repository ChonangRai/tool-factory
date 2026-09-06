import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Cloudflare Turnstile widget for the public submission form.
 *
 * The token this produces is never trusted here -- it is sent to the
 * public-anon-gate Edge Function, which verifies it against Cloudflare with
 * the secret key and returns a short-lived capability. Only the public site
 * key lives in the browser, and the token is never logged.
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const loadScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load'));
    document.head.appendChild(s);
  });

export interface TurnstileGateHandle {
  /** Current token, or null when unsolved/expired. */
  getToken: () => string | null;
  /** Discard the solved token and re-challenge (tokens are single-use). */
  reset: () => void;
}

interface TurnstileGateProps {
  onSolved?: (solved: boolean) => void;
}

const TurnstileGate = forwardRef<TurnstileGateHandle, TurnstileGateProps>(({ onSolved }, ref) => {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'solved' | 'error'>('loading');

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  const setToken = useCallback(
    (value: string | null) => {
      token.current = value;
      setStatus(value ? 'solved' : 'ready');
      onSolved?.(!!value);
    },
    [onSolved]
  );

  useImperativeHandle(ref, () => ({
    getToken: () => token.current,
    reset: () => {
      setToken(null);
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (!siteKey) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'timeout-callback': () => setToken(null),
          'error-callback': () => {
            setToken(null);
            setStatus('error');
          },
        });
        setStatus((s) => (s === 'loading' ? 'ready' : s));
      })
      .catch(() => !cancelled && setStatus('error'));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, setToken]);

  if (!siteKey) {
    return (
      <p className="flex items-center gap-2 p-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Verification is unavailable. Please contact the form owner.
      </p>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {/* Turnstile sizes its own iframe; the wrapper just keeps it from
          overflowing narrow screens. */}
      <div ref={holder} className="max-w-full overflow-x-auto" />
      {status === 'error' && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Verification could not load. Check your connection and try again.
        </p>
      )}
    </div>
  );
});

TurnstileGate.displayName = 'TurnstileGate';

export default TurnstileGate;
