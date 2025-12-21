// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();

    if (!submission_id) {
      throw new Error('Submission ID is required');
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch submission details
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select(`
        *,
        forms (name)
      `)
      .eq('id', submission_id)
      .single();

    if (submissionError || !submission) {
      throw new Error('Submission not found');
    }

    // Send email notifications
    console.log(`Sending email for submission: ${submission.id} to ${submission.email}`);
    await sendEmailNotifications(submission);

    return new Response(
      JSON.stringify({ success: true, message: 'Email notification sent' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (!sendgridApiKey || !emailFrom) {
      console.log('Email configuration missing (SENDGRID_API_KEY or EMAIL_FROM), skipping notifications');
      return;
    }

    const targetEmail = submission.email || submission.data?.email;

    if (!targetEmail) {
      console.log('Submission has no email address (checked standard column and data.email), skipping notification');
      return;
    }

    const formName = submission.forms?.name || 'Form Submission';
    const amountDisplay = submission.amount ? `$${submission.amount}` : 'N/A';
    const dateDisplay = submission.date || new Date(submission.created_at).toLocaleDateString();

    const emailContent = `
      <h1>${formName} - Receipt Confirmed</h1>
      <p>Thank you for your submission. Here are the details we received:</p>
      <ul>
        <li><strong>Submission ID:</strong> ${submission.id}</li>
        <li><strong>Amount:</strong> ${amountDisplay}</li>
        <li><strong>Date:</strong> ${dateDisplay}</li>
        <li><strong>Description:</strong> ${submission.description || 'N/A'}</li>
      </ul>
      <p>Your submission is now under review.</p>
    `;

    // Send confirmation email to submitter
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: targetEmail }],
          subject: `${formName} - Receipt Submission Confirmed`,
        }],
        from: { email: emailFrom },
        content: [{
          type: 'text/html',
          value: emailContent,
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API Error: ${errorText}`);
    }

    console.log('Email sent successfully via SendGrid');
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error; // Re-throw to be caught by the main handler
  }
}
