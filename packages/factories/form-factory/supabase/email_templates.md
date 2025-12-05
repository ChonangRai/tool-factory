# Supabase Email Templates

Copy these HTML templates into your Supabase Dashboard under **Authentication -> Email Templates**.

## 1. Confirm Signup
**Subject**: Confirm your ReceiptCollector account

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 24px; font-weight: 600;">ReceiptCollector</h1>
  </div>
  
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <h2 style="margin-top: 0; color: #111827; font-size: 20px;">Verify your email address</h2>
    <p style="color: #4b5563; margin-bottom: 24px;">
      Thanks for signing up for ReceiptCollector! Please click the button below to verify your email address and complete your registration.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{ .ConfirmationURL }}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Verify Email</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
    &copy; 2024 ReceiptCollector. All rights reserved.
  </div>
</body>
</html>
```

## 2. Reset Password
**Subject**: Reset your ReceiptCollector password

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 24px; font-weight: 600;">ReceiptCollector</h1>
  </div>
  
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <h2 style="margin-top: 0; color: #111827; font-size: 20px;">Reset your password</h2>
    <p style="color: #4b5563; margin-bottom: 24px;">
      We received a request to reset the password for your ReceiptCollector account. Click the button below to choose a new password.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{ .ConfirmationURL }}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Reset Password</a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
      If you didn't request a password reset, you can safely ignore this email. This link will expire in 24 hours.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
    &copy; 2024 ReceiptCollector. All rights reserved.
  </div>
</body>
</html>
```

## 3. Invite User
**Subject**: You have been invited to ReceiptCollector

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 24px; font-weight: 600;">ReceiptCollector</h1>
  </div>
  
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <h2 style="margin-top: 0; color: #111827; font-size: 20px;">You've been invited</h2>
    <p style="color: #4b5563; margin-bottom: 24px;">
      You have been invited to join ReceiptCollector. Click the button below to accept the invitation and set up your account.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{ .ConfirmationURL }}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Accept Invitation</a>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
    &copy; 2024 ReceiptCollector. All rights reserved.
  </div>
</body>
</html>
```
