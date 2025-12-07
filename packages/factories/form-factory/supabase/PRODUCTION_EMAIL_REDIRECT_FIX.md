# Fix Email Verification Redirect for Production

## Problem

When signing up from the production Vercel deployment, the email verification link redirects to `localhost:3000` instead of the production URL.

## Root Cause

The code uses `window.location.origin` which is correct, but Supabase stores allowed redirect URLs in its configuration. The production URL needs to be added to Supabase's allowed URL list.

## Solution

### Step 1: Update Supabase Site URL Configuration

1. **Go to Supabase Dashboard**
   - Navigate to your form-factory project
   - Go to **Authentication** → **URL Configuration**

2. **Update Site URL**
   - Set **Site URL** to your production URL: `https://your-vercel-app.vercel.app`
   - This is the default URL users will be redirected to

3. **Add Redirect URLs**
   - In **Redirect URLs** section, add BOTH:
     - `http://localhost:8080/auth` (for local development)
     - `https://your-vercel-app.vercel.app/auth` (for production)
   - Click **Save**

### Step 2: Verify Environment Variables (Optional)

The current code already handles this correctly using `window.location.origin`, but if you want to be explicit, you can create environment variables.

**Not required** - the current implementation is correct and will work once Supabase is configured.

## Testing

1. **Deploy to Vercel**
   - Push your changes to trigger a deployment

2. **Test Production Signup**
   - Go to your Vercel URL
   - Sign up with a new email
   - Check the verification email
   - Click the link - it should now redirect to your Vercel URL, not localhost

3. **Test Local Development**
   - Run `npm run dev:form`
   - Sign up with a different email
   - Verification link should still redirect to localhost:8080

## Important Notes

> [!IMPORTANT]
> - You must add ALL domains (localhost AND production) to the Supabase redirect URLs list
> - The Site URL in Supabase should be your primary/production URL
> - Email templates use the redirect URL from the signup request, which uses `window.location.origin`

## What Your Vercel URL Is

To find your Vercel deployment URL:
1. Go to your Vercel dashboard
2. Select the form-factory project
3. Copy the URL from the deployment (usually `https://your-project-name.vercel.app`)
4. Use this URL in the Supabase configuration above
