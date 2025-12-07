import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, User, Building2, Bell } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

export default function Settings() {
  const { user, organizationId, isManager } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);

  // Load user profile and organization data
  useEffect(() => {
    loadSettings();
  }, [user, organizationId]);

  const loadSettings = async () => {
    if (!user || !organizationId) return;

    try {
      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (profile) {
        setProfileName(profile.name || '');
      }

      // Load organization (if manager)
      if (isManager) {
        const { data: org } = await (supabase as any)
          .from('organizations')
          .select('name, slug')
          .eq('id', organizationId)
          .single();

        if (org) {
          setOrgName(org.name || '');
          setOrgSlug(org.slug || '');
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: profileName })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!organizationId || !isManager) return;

    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('organizations')
        .update({ name: orgName })
        .eq('id', organizationId);

      if (error) throw error;

      toast.success('Organization updated successfully');
    } catch (error: any) {
      console.error('Error updating organization:', error);
      toast.error('Failed to update organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="organization">
              <Building2 className="mr-2 h-4 w-4" />
              Organization
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>

              <Separator />

              <div className="flex justify-end gap-2">
                <Button onClick={loadSettings} variant="outline" disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Security</CardTitle>
              <CardDescription>
                Manage your password and security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Password</Label>
                  <p className="text-sm text-muted-foreground">
                    Manage your password through email verification
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { error } = await supabase.auth.resetPasswordForEmail(
                        user?.email || '',
                        { redirectTo: `${window.location.origin}/auth/reset-password` }
                      );
                      if (error) throw error;
                      toast.success('Password reset email sent');
                    } catch (error) {
                      toast.error('Failed to send reset email');
                    }
                  }}
                >
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab (Managers only) */}
        {isManager && (
          <TabsContent value="organization" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Manage your organization settings and information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    type="text"
                    placeholder="Enter organization name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Organization Slug</Label>
                  <Input
                    id="orgSlug"
                    type="text"
                    value={orgSlug}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Slug is read-only and used for URL identification
                  </p>
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button onClick={loadSettings} variant="outline" disabled={loading}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveOrganization} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Manage when and how you receive email notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Submissions</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive emails when new forms are submitted
                  </p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Status Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when submission status changes
                  </p>
                </div>
                <Switch checked={true} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Team Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about team member changes
                  </p>
                </div>
                <Switch checked={true} />
              </div>

              <Separator />

              <div className="rounded-lg border border-muted bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Email notification preferences will be saved to your profile settings in a future update.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
