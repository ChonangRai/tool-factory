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

interface OrganizationUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: {
    email: string;
    name: string;
  };
}

export default function UserManagement() {
  const { organizationId, orgRole, user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

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
        .select('id, user_id, role, created_at')
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
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const { error } = await (supabase as any)
        .from('user_organization_roles')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      toast.success('Role updated successfully');
      loadUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
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
          expires_at: expiresAt.toISOString(),
        })
        .select('token')
        .single();

      if (error) throw error;

      const inviteLink = `${window.location.origin}/auth?mode=signup&token=${data.token}`;
      navigator.clipboard.writeText(inviteLink);
      toast.success('Secure invite link copied to clipboard');
      setIsInviteDialogOpen(false);
      setInviteEmail(''); // Reset email field
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      toast.error('Failed to create invitation');
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
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.profiles?.name || 'Unknown'}
                    </TableCell>
                    <TableCell>{user.profiles?.email}</TableCell>
                    <TableCell>
                      {(orgRole === 'super_manager' || (orgRole === 'manager' && user.role === 'staff')) && user.user_id !== currentUser?.id ? (
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
                              <SelectItem value="super_manager">
                                <Badge variant="default">Super Manager</Badge>
                              </SelectItem>
                            )}
                            <SelectItem value="manager">
                              <Badge variant="secondary">Manager</Badge>
                            </SelectItem>
                            <SelectItem value="staff">
                              <Badge variant="outline">Staff</Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role === 'super_manager' ? 'Super Manager' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      {(orgRole === 'super_manager' || (orgRole === 'manager' && user.role === 'staff')) && user.user_id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUserToDelete(user.user_id)}
                          disabled={user.role === 'super_manager' && orgRole !== 'super_manager'}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this user from your organization? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => userToDelete && handleRemoveUser(userToDelete)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
