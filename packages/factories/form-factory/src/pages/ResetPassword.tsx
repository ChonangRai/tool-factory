import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import {
  NEW_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_HINT,
  validateNewPassword,
  validatePasswordConfirmation,
} from '@/lib/passwordPolicy';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();

  // Shown inline rather than only as a toast so screen readers announce it and
  // it stays on screen next to the field it refers to.
  const lengthError = password ? validateNewPassword(password) : null;
  const matchError = confirmPassword ? validatePasswordConfirmation(password, confirmPassword) : null;

  useEffect(() => {
    if (!session) {
      // If no session, redirect to auth (link might be invalid or expired)
      // But give it a moment as session might be restoring
      const timer = setTimeout(() => {
        if (!session) navigate('/auth');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate before touching the recovery session, so a mistyped
    // confirmation costs nothing and the link stays usable.
    const invalid = validateNewPassword(password) ?? validatePasswordConfirmation(password, confirmPassword);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setLoading(true);

    try {
      const { error } = await updatePassword(password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully');
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                aria-invalid={!!lengthError}
                aria-describedby="password-hint"
              />
              <p
                id="password-hint"
                className={lengthError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
                role={lengthError ? 'alert' : undefined}
              >
                {lengthError ?? NEW_PASSWORD_HINT}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={NEW_PASSWORD_MIN_LENGTH}
                aria-invalid={!!matchError}
                aria-describedby={matchError ? 'confirm-password-error' : undefined}
              />
              {matchError && (
                <p id="confirm-password-error" role="alert" className="text-sm text-destructive">
                  {matchError}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !!lengthError || !!matchError || !confirmPassword}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
