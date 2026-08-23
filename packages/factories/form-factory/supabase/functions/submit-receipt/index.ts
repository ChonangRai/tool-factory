// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @ts-ignore
import { Resend } from "npm:resend";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimal HTML escaping for every untrusted value interpolated into the
// email body below (submitter-entered field labels/values, description,
// form name). Never build HTML from unescaped user input.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// @ts-ignore
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorization is the receipt_ticket_id alone -- a one-time,
    // submission-bound capability minted by submit_form(). This is
    // deliberately NOT a submission_id: possession of a submission's UUID
    // must not be sufficient to trigger sending its receipt (see the
    // security audit this replaces). There is no authenticated caller
    // identity to check here -- anonymous submitters have none -- so the
    // capability itself, atomically single-use, is the entire boundary.
    const { receipt_ticket_id } = await req.json();

    if (!receipt_ticket_id) {
      throw new Error('receipt_ticket_id is required');
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Atomic claim (pending/failed/stale-processing -> processing), bounded
    // to 3 attempts and the ticket's own expiry. This replaces a plain
    // "consume once" flag: a transient Resend failure, a network error, or
    // a crashed invocation used to leave the ticket permanently spent with
    // no email ever sent and no way to retry. It is still exactly one
    // atomic UPDATE server-side (see claim_receipt_ticket, 033) -- a
    // concurrent second request cannot also win a claim, so this adds
    // retry-on-failure, not unrestricted replay. A genuinely already-sent
    // ticket, or one that has exhausted its attempts, or an unknown/expired
    // id, all fail this claim identically.
    const { data: claimRows, error: claimError } = await supabase.rpc('claim_receipt_ticket', {
      p_ticket_id: receipt_ticket_id,
    });
    const claim = claimRows?.[0];

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: 'Invalid, expired, already-sent, or exhausted receipt ticket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // submission_id comes only from the ticket we just claimed -- never
    // from the request -- so a ticket for submission A can never be used
    // to fetch or email submission B.
    try {
      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .select(`
          *,
          forms (name, settings)
        `)
        .eq('id', claim.submission_id)
        .single();

      if (submissionError || !submission) {
        throw new Error('Submission not found');
      }

      console.log(`Sending email for submission: ${submission.id}`);
      await sendEmailNotifications(submission);

      await supabase.rpc('mark_receipt_ticket_sent', { p_ticket_id: receipt_ticket_id });

      return new Response(
        JSON.stringify({ success: true, message: 'Email notification sent' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (sendError: any) {
      // Release the claim so a later retry (transient Resend error, a
      // temporarily missing secret, a network blip) can succeed instead of
      // the receipt becoming permanently unsendable. Bounded by the same
      // 3-attempt/expiry limits enforced in the claim itself.
      await supabase.rpc('mark_receipt_ticket_failed', { p_ticket_id: receipt_ticket_id });
      throw sendError;
    }
  } catch (error: any) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function sendEmailNotifications(submission: any) {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (!resendApiKey || !emailFrom) {
      // Throw (not a silent return): the caller marks the ticket 'failed'
      // rather than 'sent' so a retry after secrets are fixed can still
      // succeed, instead of the receipt being silently and permanently
      // dropped.
      throw new Error('Email configuration missing, cannot send notification');
    }

    const resend = new Resend(resendApiKey);

    // Destination is always the submission's own stored email field -- the
    // value the submitter themselves provided at submission time via
    // submit_form(). Never taken from the request that triggers this send.
    const targetEmail = submission.email || submission.data?.email;

    if (!targetEmail) {
      // Genuinely nothing to send -- not transient -- but still marked
      // 'failed' rather than 'sent' by the caller; the attempt cap (3)
      // bounds how many times this can be retried for no benefit.
      throw new Error('Submission has no email address, cannot send notification');
    }

    const formName = escapeHtml(submission.forms?.name || 'Form Submission');
    const formFields = submission.forms?.settings?.fields || [];

    const fieldMap = new Map(formFields.map((f: any) => [f.id, f.label]));

    let fieldsHtml = '';
    const submissionData = submission.data || {};

    formFields.forEach((field: any) => {
      if (field.type === 'file') return;

      const value = submissionData[field.id];
      if (value !== undefined && value !== null && value !== '') {
        fieldsHtml += `<li><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value)}</li>`;
      }
    });

    if (!fieldsHtml) {
      if (submission.amount) fieldsHtml += `<li><strong>Amount:</strong> ${escapeHtml(submission.amount)}</li>`;
      if (submission.description) fieldsHtml += `<li><strong>Description:</strong> ${escapeHtml(submission.description)}</li>`;
    }

    const emailContent = `
      <h1>${formName} - Receipt Confirmed</h1>
      <p>Thank you for your submission. Here are the details we received:</p>
      <ul>
        ${fieldsHtml}
        <li><strong>Submission ID:</strong> ${escapeHtml(submission.id)}</li>
        <li><strong>Date:</strong> ${escapeHtml(new Date(submission.created_at).toLocaleDateString())}</li>
      </ul>
      <p>Your submission is now under review.</p>
    `;

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [targetEmail],
      subject: `${submission.forms?.name || 'Form Submission'} - Receipt Submission Confirmed`,
      html: emailContent,
    });

    if (error) {
      throw new Error(`Resend API Error: ${error.message}`);
    }

    console.log('Email sent successfully');
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}
