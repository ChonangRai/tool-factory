import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const mode = searchParams.get('mode');

  // Handle email verification callback
  useEffect(() => {
    const handleEmailVerification = async () => {
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      const type = searchParams.get('type');

      if (error) {
        // Handle verification errors
        if (error === 'access_denied' || errorDescription?.includes('expired')) {
          toast.error('Verification link has expired. Please sign up again or request a new verification email.');
        } else if (errorDescription?.includes('already confirmed')) {
          toast.info('Your email is already verified. You can sign in now.');
        } else {
          toast.error('Email verification failed. Please try again or contact support.');
        }
        navigate('/auth', { replace: true });
      } else if (type === 'signup') {
        // Email verification successful
        toast.success('Email verified successfully! You can now sign in to your account.', {
          duration: 5000,
        });
        setIsLogin(true);
        navigate('/auth', { replace: true });
      }
    };

    handleEmailVerification();
  }, [searchParams, navigate]);

  useEffect(() => {
    if (mode === 'signup') {
      setIsLogin(false);
    }
  }, [mode]);

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Signed in successfully');
      
          // Get current user
          const { data: userData } = await supabase.auth.getUser();
          if (!userData?.user) {
            toast.error('Failed to get user information');
            setLoading(false);
            return;
          }

          // Check if user has an active organization
          const { data: roles, error: rolesError } = await (supabase as any)
            .from('user_organization_roles')
            .select('status, organization_id')
            .eq('user_id', userData.user.id)
            .eq('status', 'active');

          if (rolesError) {
            console.error('Error checking organization:', rolesError);
          }

          if (!roles || roles.length === 0) {
            // User has no active organization - block login
            await supabase.auth.signOut();
            toast.error('Your account is inactive or not associated with any workspace. Please contact your administrator.', {
              duration: 6000,
            });
            setLoading(false);
            return;
          }

          navigate('/dashboard');
        }
      } else {
        // Signup flow
        if (!inviteToken && !organizationName.trim()) {
          toast.error('Workspace name is required');
          setLoading(false);
          return;
        }

        // Store org name temporarily so useAuth can access it if needed
        if (organizationName) {
          (window as any).signupOrgName = organizationName;
        }

        const { data: authData, error } = await signUp(email, password, name, inviteToken || undefined);
        
        // Clean up
        delete (window as any).signupOrgName;

        if (error) {
          console.error('Signup error:', error);
          
          // Handle specific error cases
          if (error.message.includes('User already registered')) {
            toast.error('An account with this email already exists. Please sign in instead.');
          } else if (error.message.includes('Email rate limit exceeded')) {
            toast.error('Too many signup attempts. Please try again in a few minutes.');
          } else if (inviteToken && error.message.includes('duplicate')) {
            toast.error('This invitation has already been used. Please contact your administrator for a new invite link.');
          } else {
            toast.error(error.message || 'Failed to create account');
          }
        } else {
          // Check if using an invite token
          if (inviteToken) {
            toast.success('Account created! You can now sign in to access your workspace.', {
              duration: 5000,
            });
          } else {
            toast.success('Account created! Please check your email to verify your account.', {
              duration: 5000,
            });
          }
          
          // Clear form and switch to login
          setEmail('');
          setPassword('');
          setName('');
          setOrganizationName('');
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      
      // Handle network or unexpected errors
      if (error.message?.includes('Failed to fetch') || error.message?.includes('network')) {
        toast.error('Network error. Please check your connection and try again.');
      } else {
        toast.error(error.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await resetPassword(resetEmail);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Please check your inbox.');
        setIsResetOpen(false);
        setResetEmail('');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Receipt className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">
            {isLogin ? 'Manager Sign In' : 'Create Manager Account'}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? 'Enter your credentials to access the manager dashboard'
              : 'Create a new manager account to manage submissions'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                {!inviteToken && (
                  <div className="space-y-2">
                    <Label htmlFor="organization">Workspace Name</Label>
                    <Input
                      id="organization"
                      type="text"
                      placeholder="Acme Corp"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>
            {isLogin && (
              <div className="text-right">
                <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset Password</DialogTitle>
                      <DialogDescription>
                        Enter your email address and we'll send you a link to reset your password.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleResetPassword} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="admin@example.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                          disabled={loading}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          'Send Reset Link'
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>{isLogin ? 'Sign In' : 'Create Account'}</>
              )}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
              disabled={loading}
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
