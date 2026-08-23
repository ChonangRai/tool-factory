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
    // Only the invitation id is accepted from the client. Everything else
    // sent to the email (organization name, inviter name, the link, the
    // destination address) is resolved from trusted database state below --
    // none of it is trusted from the request body. This closes the
    // previous behavior where any caller with the (public) anon key could
    // send an arbitrarily-addressed, arbitrarily-worded email through the
    // product's own sending domain.
    const { invitation_id } = await req.json();
    if (!invitation_id) {
      throw new Error('invitation_id is required');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // A client scoped to the CALLER's own JWT, not the service role. Every
    // query below runs under the caller's real RLS -- there is no separate
    // "check membership" step to get wrong, because the database itself
    // will not return the invitation row (or the org/profile rows used for
    // display text) unless the caller is actually a manager/super_manager
    // of that invitation's organization (invitations_select_org_managers).
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // auth.getUser() does not consult the global headers above for its own
    // auth API call -- the bearer token must be passed explicitly to
    // validate *this* caller's session.
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await callerClient.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: invitation, error: invitationError } = await callerClient
      .from('invitations')
      .select('id, organization_id, email, token, expires_at')
      .eq('id', invitation_id)
      .single();

    if (invitationError || !invitation) {
      // RLS hides invitations for organizations the caller doesn't manage,
      // so this also covers "wrong org" and "not a manager" -- both come
      // back as not-found, not a distinguishable 403, to avoid confirming
      // the invitation's existence to an unauthorized caller.
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!invitation.email) {
      return new Response(
        JSON.stringify({ error: 'This is a generic invite link with no email to send to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      return new Response(JSON.stringify({ error: 'Invitation has expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: org } = await callerClient
      .from('organizations')
      .select('name')
      .eq('id', invitation.organization_id)
      .single();

    const { data: profile } = await callerClient
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    // Trusted application configuration, not a caller-supplied URL --
    // closes the "arbitrary phishing link" path. Must be set as a real
    // Supabase secret before this is used in production (see deployment
    // notes); the fallback is only correct for local development.
    // @ts-ignore
    const siteUrl = (Deno.env.get('SITE_URL') || 'http://127.0.0.1:3000').replace(/\/$/, '');
    const inviteLink = `${siteUrl}/auth?mode=signup&token=${encodeURIComponent(invitation.token)}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (!resendApiKey || !emailFrom) {
      throw new Error('Email configuration missing in Edge Function secrets');
    }

    const resend = new Resend(resendApiKey);

    const inviterName = escapeHtml(profile?.name || 'A team member');
    const organizationName = escapeHtml(org?.name || 'their organization');
    const safeLink = escapeHtml(inviteLink);

    const emailContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ToolFactory.</p>
        <p>Click the button below to accept the invitation and set up your account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${safeLink}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Join Organization</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${safeLink}">${safeLink}</a></p>
        <hr />
        <p style="font-size: 12px; color: #666;">This link expires in 7 days.</p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: emailFrom,
      to: [invitation.email],
      subject: `Invitation to join ${org?.name || 'ToolFactory'}`,
      html: emailContent,
    });

    if (error) {
      throw new Error(`Resend API Error: ${error.message}`);
    }

    console.log(`Invitation email sent for invitation ${invitation.id}`);

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
