// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SubmissionData {
  name: string;
  contact_number: string;
  email: string;
  date: string;
  description: string;
  amount: number;
  formId: string;
}

// @ts-ignore
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const dataStr = formData.get('data') as string;
    const data: SubmissionData = JSON.parse(dataStr);



    // Get client IP (basic rate limiting identifier)
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';

    // Get default form
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('id')
      .select('id')
      .eq('id', data.formId)
      .single();

    if (formError || !form) {
      throw new Error('Form not found');
    }

    // Create submission
    // Build the insertion object dynamically, only include fields that are present
    const submissionPayload: Record<string, any> = {
      form_id: form.id,
      name: data.name,
      ...(data.contact_number && { contact_number: data.contact_number }),
      // optional fields – include only if defined / non‑empty
      ...(data.email && { email: data.email }),
      ...(data.date && { date: data.date }),
      ...(data.description && { description: data.description }),
      ...(data.amount !== undefined && data.amount !== null && { amount: data.amount }),
      status: 'new',
      submitter_ip: clientIP,
    };

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert(submissionPayload)
      .select()
      .single();

    if (submissionError) {
      throw submissionError;
    }

    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${submission.id}.${fileExt}`;
    const filePath = `submissions/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // Rollback submission if upload fails
      await supabase.from('submissions').delete().eq('id', submission.id);
      throw uploadError;
    }

    // Save file metadata
    const { error: fileError } = await supabase.from('files').insert({
      submission_id: submission.id,
      bucket: 'receipts',
      path: filePath,
      filename: file.name,
      mime: file.type,
      size: file.size,
    });

    if (fileError) {
      console.error('Error saving file metadata:', fileError);
    }

    // Send email notifications (non-blocking)
    sendEmailNotifications(submission, data.email).catch(err => 
      console.error('Email notification failed:', err)
    );

    return new Response(
      JSON.stringify({ success: true, submissionId: submission.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error processing submission:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function sendEmailNotifications(submission: any, submitterEmail: string) {
  try {
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (!sendgridApiKey || !emailFrom) {
      console.log('Email configuration missing, skipping notifications');
      return;
    }

    // Send confirmation email to submitter
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: submitterEmail }],
          subject: 'Receipt Submission Confirmed',
        }],
        from: { email: emailFrom },
        content: [{
          type: 'text/html',
          value: `
            <h1>Receipt Submitted Successfully</h1>
            <p>Thank you for submitting your receipt. Here are the details:</p>
            <ul>
              <li><strong>Submission ID:</strong> ${submission.id}</li>
              <li><strong>Amount:</strong> $${submission.amount}</li>
              <li><strong>Date:</strong> ${submission.date}</li>
              <li><strong>Description:</strong> ${submission.description}</li>
            </ul>
            <p>Your submission is now under review. You will be notified once it has been processed.</p>
          `,
        }],
      }),
    });

    console.log('Email notifications sent successfully');
  } catch (error) {
    console.error('Error sending email notifications:', error);
  }
}
