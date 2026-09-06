// Trusted boundary for the two anonymous resource-creating flows.
//
// Anonymous callers no longer hold EXECUTE on submit_form or
// create_upload_ticket (migration 035). They come here instead:
//
//   verify -> proves humanity once with Cloudflare Turnstile, returns a
//             short-lived capability scoped to one form
//   ticket -> spends the capability to mint one upload ticket
//   submit -> spends the capability to create the submission
//
// The capability exists so a multi-attachment submission needs one challenge,
// not one per file. It is an HMAC-signed value, not a database row: nothing to
// clean up, and it cannot be forged without the server secret. All tenant and
// storage authority stays in the existing SECURITY DEFINER RPCs, which this
// function calls with the service role rather than reimplementing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CAPABILITY_TTL_SECONDS = 900; // 15 minutes: long enough to upload several files.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(pad + '='.repeat((4 - (pad.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

const hmacKey = async (secret: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

const signCapability = async (formId: string, secret: string) => {
  const payload = JSON.stringify({ f: formId, exp: Math.floor(Date.now() / 1000) + CAPABILITY_TTL_SECONDS });
  const body = b64url(new TextEncoder().encode(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
};

const readCapability = async (token: string, formId: string, secret: string) => {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };

  // A hostile caller controls both halves, so decoding and verification are
  // guarded together: non-base64 input makes atob throw, which would otherwise
  // surface as a 500 instead of a clean rejection.
  let claims: { f?: string; exp?: number };
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromB64url(sig),
      new TextEncoder().encode(body)
    );
    if (!valid) return { ok: false, reason: 'bad signature' };
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  if (claims.f !== formId) return { ok: false, reason: 'wrong form' };
  return { ok: true as const };
};

/** Cloudflare treats each token as single-use, so a capability costs one challenge. */
const verifyTurnstile = async (token: string, secret: string) => {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const out = await r.json();
  return { success: !!out.success, codes: out['error-codes'] ?? [] };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const capabilitySecret = Deno.env.get('ANON_CAPABILITY_SECRET');
  if (!turnstileSecret || !capabilitySecret) {
    console.error('public-anon-gate is not configured: missing TURNSTILE_SECRET_KEY or ANON_CAPABILITY_SECRET');
    return json({ error: 'Verification is temporarily unavailable. Please try again later.' }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const action = String(payload.action ?? '');
  const formId = String(payload.form_id ?? '');
  if (!formId) return json({ error: 'form_id is required' }, 400);

  // Step 1: one Turnstile challenge buys a short-lived, form-scoped capability.
  if (action === 'verify') {
    const token = String(payload.turnstile_token ?? '');
    if (!token) return json({ error: 'Verification required.', code: 'turnstile_missing' }, 400);

    const result = await verifyTurnstile(token, turnstileSecret);
    if (!result.success) {
      return json({ error: 'Verification failed. Please try again.', code: 'turnstile_invalid' }, 403);
    }
    return json({ capability: await signCapability(formId, capabilitySecret), expires_in: CAPABILITY_TTL_SECONDS });
  }

  if (action !== 'ticket' && action !== 'submit') return json({ error: 'Unknown action' }, 400);

  const capability = await readCapability(String(payload.capability ?? ''), formId, capabilitySecret);
  if (!capability.ok) {
    return json({ error: 'Verification expired. Please complete the check again.', code: 'capability_invalid' }, 403);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  if (action === 'ticket') {
    const { data, error } = await admin.rpc('create_upload_ticket', { p_form_id: formId });
    if (error) {
      // 53400 (configuration_limit_exceeded) is the per-form outstanding cap.
      const capped = error.code === '53400' || /too many uploads/i.test(error.message ?? '');
      return json(
        { error: capped ? error.message : 'Could not start file upload', code: capped ? 'ticket_cap' : 'ticket_failed' },
        capped ? 429 : 400
      );
    }
    const ticket = Array.isArray(data) ? data[0] : data;
    return json({ ticket_id: ticket.ticket_id, path: ticket.path, expires_at: ticket.expires_at });
  }

  const { data, error } = await admin.rpc('submit_form', {
    p_form_id: formId,
    p_data: payload.data ?? {},
    p_files: payload.files ?? [],
  });
  if (error) {
    console.error('submit_form failed', error.message);
    return json({ error: error.message || 'Submission failed', code: 'submit_failed' }, 400);
  }
  const result = Array.isArray(data) ? data[0] : data;
  return json(result ?? {});
});
