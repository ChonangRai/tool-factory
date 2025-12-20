// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    const { email, invite_link, organization_name, inviter_name } = await req.json();

    if (!email || !invite_link) {
      throw new Error('Email and invite link are required');
    }

    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (!sendgridApiKey || !emailFrom) {
      throw new Error('Email configuration missing in Edge Function secrets');
    }

    const emailContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p><strong>${inviter_name || 'Someone'}</strong> has invited you to join <strong>${organization_name || 'their organization'}</strong> on ToolFactory.</p>
        <p>Click the button below to accept the invitation and set up your account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invite_link}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Join Organization</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${invite_link}">${invite_link}</a></p>
        <hr />
        <p style="font-size: 12px; color: #666;">This link expires in 7 days.</p>
      </div>
    `;

    // Send email via SendGrid
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }],
          subject: `Invitation to join ${organization_name || 'ToolFactory'}`,
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

    console.log(`Invitation email sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Invitation sent successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error sending invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
