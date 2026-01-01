import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Loader2,
  UserPlus,
  Copy,
  Trash2,
  Edit2,
  UserMinus,
  Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Helper function to check if current user can remove target user
const canRemoveUser = (
  currentRole: string | null,
  targetRole: string,
  targetUserId: string,
  currentUserId: string | undefined
) => {
  // Can't remove yourself
  if (!currentUserId || targetUserId === currentUserId) return false;
  
  // Super manager can remove manager and staff
  if (currentRole === 'super_manager' && ['manager', 'staff'].includes(targetRole)) {
    return true;
  }
  
  // Manager can remove staff only
  if (currentRole === 'manager' && targetRole === 'staff') {
    return true;
  }
  
  return false;
};

interface OrganizationUser {
  id: string;
  user_id: string;
  role: string;
  status?: string; // 'active' or 'inactive'
  created_at: string;
  profiles: {
    email: string;
    name: string;
  };
}

interface Invite {
  id: string;
  email: string | null;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
}

export default function UserManagement() {
  const { organizationId, orgRole, user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  
  // New state for removal dialog
  const [showRemovalDialog, setShowRemovalDialog] = useState(false);
  const [userToRemove, setUserToRemove] = useState<{userId: string; userName: string} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  useEffect(() => {
    if (organizationId) {
      loadUsers();
    }
  }, [organizationId]);

  const loadUsers = async () => {
    try {
      // Get user organization roles
      const { data: roles, error: rolesError } = await (supabase as any)
        .from('user_organization_roles')
        .select('id, user_id, role, status, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });

      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get user IDs
      const userIds = roles.map((r: any) => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Create a map of profiles by user_id
      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p])
      );

      // Combine the data - ensure we're using the actual profile data
      const combined = roles.map((role: any) => {
        const profile = profileMap.get(role.user_id);
        return {
          ...role,
          profiles: {
            email: profile?.email || 'Unknown',
            name: profile?.name || profile?.email?.split('@')[0] || 'Unknown'
          }
        };
      });

      console.log('Loaded users:', combined); // Debug log
      setUsers(combined);

      // Fetch pending invitations
      const { data: invitationsData, error: invitationsError } = await (supabase as any)
        .from('invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .gt('expires_at', new Date().toISOString()) // Only valid invites
        .order('created_at', { ascending: false });

      if (invitationsError) {
        console.error('Error loading invitations:', invitationsError);
      } else {
        setInvitations(invitationsData || []);
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    // Check if promoting to super_manager - show warning
    if (newRole === 'super_manager' && orgRole === 'super_manager') {
      const targetUser = users.find(u => u.user_id === userId);
      setConfirmDialog({
        open: true,
        title: 'Transfer Leadership?',
        description: `Only one Super Manager is allowed per workspace. Promoting ${targetUser?.profiles?.name || 'this user'} will automatically demote you to Manager. Do you want to continue?`,
        onConfirm: async () => {
          try {
            // Use RPC function to bypass RLS issues
            const { error } = await (supabase as any).rpc('update_user_role', {
              p_user_id: userId,
              p_organization_id: organizationId,
              p_new_role: newRole
            });

            if (error) throw error;

            toast.success('Leadership transferred successfully. You are now a Manager.');
            setConfirmDialog({ open: false, title: '', description: '', onConfirm: () => {} });
            loadUsers();
          } catch (error: any) {
            console.error('Error updating role:', error);
            toast.error('Failed to update role: ' + error.message);
          }
        }
      });
      return;
    }

    // Normal role change using RPC
    try {
      const { error } = await (supabase as any).rpc('update_user_role', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_new_role: newRole
      });

      if (error) throw error;

      toast.success('Role updated successfully');
      loadUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role: ' + error.message);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      // Call RPC to completely delete user from auth.users
      // This will cascade to profiles and user_organization_roles
      const { error } = await (supabase as any).rpc('delete_user_completely', {
        p_user_id: userId
      });

      if (error) throw error;

      toast.success('User permanently deleted from system');
      setUserToDelete(null);
      loadUsers();
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error('Failed to remove user: ' + error.message);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_manager':
        return 'default';
      case 'manager':
        return 'secondary';
      case 'staff':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const createInvitation = async () => {
    try {
      // Validate email if provided
      if (inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }

      // Generate secure token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      const { data, error } = await (supabase as any)
        .from('invitations')
        .insert({
          organization_id: organizationId,
          role: 'staff', // Default role
          email: inviteEmail || null, // Optional email for targeted invites
          token: token,
          created_by: currentUser?.id,
          expires_at: expiresAt.toISOString(),
        })
        .select('token')
        .single();

      if (error) throw error;

      const inviteLink = `${window.location.origin}/auth?mode=signup&token=${data.token}`;
      
      // If email provided, send invitation email via Edge Function
      if (inviteEmail) {
        // Fetch organization name
        const { data: org } = await (supabase as any)
          .from('organizations')
          .select('name')
          .eq('id', organizationId)
          .single();

        // Get inviter name
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', currentUser?.id)
          .single();

        const { error: funcError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: inviteEmail,
            invite_link: inviteLink,
            organization_name: org?.name || 'ToolFactory',
            inviter_name: profile?.name || 'A team member'
          }
        });

        if (funcError) {
          console.error('Failed to send invitation email:', funcError);
          toast.warning('Invite link created but failed to send email. Link copied to clipboard.');
        } else {
          toast.success(`Invitation sent to ${inviteEmail}`);
        }
      } else {
        toast.success('Secure invite link copied to clipboard');
      }

      navigator.clipboard.writeText(inviteLink);
      setIsInviteDialogOpen(false);
      setInviteEmail(''); // Reset email field
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      toast.error('Failed to create invitation');
    }
  };

  const handleResendInvite = async (invite: Invite) => {
    if (!invite.email) {
      toast.error('Cannot resend generic invite link via email');
      return;
    }

    try {
      // Fetch organization name
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      // Get inviter name
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', currentUser?.id)
        .single();

      const inviteLink = `${window.location.origin}/auth?mode=signup&token=${invite.token}`;

      const { error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: invite.email,
          invite_link: inviteLink,
          organization_name: org?.name || 'ToolFactory',
          inviter_name: profile?.name || 'A team member'
        }
      });

      if (error) throw error;
      toast.success(`Invitation resent to ${invite.email}`);
    } catch (error: any) {
      console.error('Error resending invitation:', error);
      toast.error('Failed to resend invitation');
    }
  };

  const handleCancelInvite = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Invitation cancelled');
      loadUsers(); // Reload to refresh list
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage users in your organization</p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Generate a secure link to invite a new user to your workspace.
                They will be added as Staff by default.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email (Optional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to create a generic invite link that anyone can use
                </p>
              </div>
              <Button onClick={createInvitation} className="w-full">
                <Copy className="mr-2 h-4 w-4" />
                Generate & Copy Invite Link
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      { invitations.length > 0 && (
        <Card className="mb-8 border-yellow-200 bg-yellow-50/50 dark:border-yellow-900/50 dark:bg-yellow-900/10">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-800 dark:text-yellow-200">Pending Invitations</CardTitle>
            <CardDescription>Users who have been invited but haven't joined yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email / Token</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{invite.email || 'Generic Link'}</span>
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{invite.token}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {invite.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {invite.email && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleResendInvite(invite)}
                            title="Resend Email"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleCancelInvite(invite.id)}
                          title="Cancel Invite"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workspace Members</CardTitle>
          <CardDescription>
            {users.length} member{users.length !== 1 ? 's' : ''} in your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className={user.status === 'inactive' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      {user.profiles?.name || 'Unknown'}
                    </TableCell>
                    <TableCell>{user.profiles?.email}</TableCell>
                    <TableCell>
                      {(orgRole === 'super_manager' || (orgRole === 'manager' && user.role === 'staff')) && user.user_id !== currentUser?.id && user.status === 'active' ? (
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user.user_id, value)}
                          disabled={user.role === 'super_manager' && orgRole !== 'super_manager'}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {orgRole === 'super_manager' && (
                              <SelectItem value="super_manager">Super Manager</SelectItem>
                            )}
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role.replace('_', ' ')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                        {user.status || 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      {/* Show reactivate button for inactive users */}
                      {user.status === 'inactive' && (orgRole === 'super_manager' || orgRole === 'manager') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { error } = await (supabase as any)
                                .from('user_organization_roles')
                                .update({ status: 'active' })
                                .eq('user_id', user.user_id)
                                .eq('organization_id', organizationId);

                              if (error) throw error;

                              toast.success('User reactivated successfully');
                              loadUsers();
                            } catch (error: any) {
                              toast.error('Failed to reactivate user: ' + error.message);
                            }
                          }}
                          className="text-green-600 hover:text-green-700"
                        >
                          Reactivate
                        </Button>
                      ) : /* Only show remove button if user has permission and user is active */
                      user.status === 'active' && canRemoveUser(orgRole, user.role, user.user_id, currentUser?.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const userName = user.profiles?.name || user.profiles?.email || 'this user';
                            setUserToRemove({ userId: user.user_id, userName });
                            setShowRemovalDialog(true);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* User Removal Dialog */}
      <AlertDialog open={showRemovalDialog} onOpenChange={setShowRemovalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {userToRemove?.userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how to remove this user from your workspace:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (!userToRemove) return;
                  try {
                    // Deactivate: Set status to inactive instead of deleting
                    const { error } = await (supabase as any)
                      .from('user_organization_roles')
                      .update({ status: 'inactive' })
                      .eq('user_id', userToRemove.userId)
                      .eq('organization_id', organizationId);

                    if (error) throw error;

                    toast.success('User deactivated. They can be reactivated later.');
                    setShowRemovalDialog(false);
                    setUserToRemove(null);
                    loadUsers();
                  } catch (error: any) {
                    toast.error('Failed to deactivate user: ' + error.message);
                  }
                }}
              >
                <UserMinus className="h-4 w-4 mr-2" />
                Deactivate - Set to inactive (Recommended)
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!userToRemove) return;
                  try {
                    // Permanent delete: Call RPC
                    const { error } = await (supabase as any).rpc('delete_user_completely', {
                      p_user_id: userToRemove.userId
                    });

                    if (error) {
                      if (error.message?.includes('Only super_managers')) {
                        toast.error('Permission denied: Only Super Managers can permanently delete users.');
                      } else {
                        throw error;
                      }
                    } else {
                      toast.success('User permanently deleted. Their forms have been reassigned to you.');
                      setShowRemovalDialog(false);
                      setUserToRemove(null);
                      loadUsers();
                    }
                  } catch (error: any) {
                    toast.error('Failed to delete user: ' + error.message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Permanent Delete - Remove completely (Cannot be undone)
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Dialog for Super Manager Promotion */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, title: '', description: '', onConfirm: () => {} })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="destructive"
      />

      {/* Old Delete Dialog - kept for backward compatibility */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this user? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (userToDelete) {
                  handleRemoveUser(userToDelete);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
