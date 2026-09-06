import { supabase } from '@/integrations/supabase/client';

/**
 * Client for the public-anon-gate Edge Function.
 *
 * Anonymous callers no longer hold EXECUTE on submit_form or
 * create_upload_ticket, so every public submission goes through here. One
 * Turnstile challenge buys a short-lived capability, and that capability
 * authorises the submission plus its related upload tickets -- a
 * multi-attachment submission is not challenged once per file.
 */

export class AnonGateError extends Error {
  readonly code: string;
  /** True when the user can fix this by solving the challenge again. */
  readonly retryable: boolean;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AnonGateError';
    this.code = code;
    this.retryable = code === 'capability_invalid' || code === 'turnstile_invalid' || code === 'turnstile_missing';
  }
}

const call = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('public-anon-gate', { body });

  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError; the JSON body carries
    // our machine-readable code.
    let payload: { error?: string; code?: string } = {};
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        payload = await response.json();
      } catch {
        /* non-JSON body */
      }
    }
    throw new AnonGateError(payload.error || error.message || 'Request failed', payload.code || 'unknown');
  }

  return data as T;
};

/** Exchanges a solved Turnstile token for a form-scoped capability. */
export const verifyHuman = (formId: string, turnstileToken: string) =>
  call<{ capability: string; expires_in: number }>({
    action: 'verify',
    form_id: formId,
    turnstile_token: turnstileToken,
  });

export const requestUploadTicket = (formId: string, capability: string) =>
  call<{ ticket_id: string; path: string; expires_at: string }>({
    action: 'ticket',
    form_id: formId,
    capability,
  });

export const submitForm = (
  formId: string,
  capability: string,
  data: Record<string, unknown>,
  files: { ticket_id: string; filename: string }[]
) =>
  call<{ submission_id: string; receipt_ticket_id?: string }>({
    action: 'submit',
    form_id: formId,
    capability,
    data,
    files,
  });
