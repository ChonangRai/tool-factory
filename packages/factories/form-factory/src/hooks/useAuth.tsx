import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Phase 4: Organization Context
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check admin/org status
        if (session?.user) {
          setTimeout(() => {
            checkUserRoles(session.user.id);
          }, 0);
        } else {
          resetRoles();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkUserRoles(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const resetRoles = () => {
    setIsAdmin(false);
    setOrganizationId(null);
    setOrgRole(null);
    setOrganizationName(null);
  };

  const checkUserRoles = async (userId: string) => {
    try {
      // 1. Check for legacy admin role (global)
      const { data: adminData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (adminData) {
        setIsAdmin(true);
        // Legacy admins might not have an org, but let's check anyway
      }

      // 2. Get User's Current Organization from Profile
      const { data: profileData } = await (supabase as any)
        .from('profiles')
        .select('current_organization_id')
        .eq('id', userId)
        .single();

      const currentOrgId = profileData?.current_organization_id;
      setOrganizationId(currentOrgId || null);

      if (currentOrgId) {
        // 3. Get Organization Name
        const { data: orgData } = await (supabase as any)
          .from('organizations')
          .select('name')
          .eq('id', currentOrgId)
          .single();
        
        if (orgData) {
          setOrganizationName(orgData.name);
        }

        // 4. Get Role in that Organization
        const { data: roleData } = await (supabase as any)
          .from('user_organization_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('organization_id', currentOrgId)
          .maybeSingle();

        if (roleData) {
          setOrgRole(roleData.role);
          
          // Map org roles to "isAdmin" for backward compatibility with existing protected routes
          // Super Managers and Managers are considered "Admins" for now
          if (['super_manager', 'manager'].includes(roleData.role)) {
            setIsAdmin(true);
          }
        }
      } else {
        // If no org, they definitely aren't an org admin
        if (!adminData) setIsAdmin(false);
      }

    } catch (error: any) {
      console.error('Error checking user roles:', error);
      resetRoles();
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) console.error('SignIn Error:', error);
    return { error };
  };

  const signUp = async (email: string, password: string, name: string, inviteToken?: string) => {
    const redirectUrl = `${window.location.origin}/auth`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name,
          organization_name: !inviteToken ? (window as any).signupOrgName || name + "'s Workspace" : undefined,
          invite_token: inviteToken,
        },
      },
    });
    if (error) console.error('SignUp Error:', error);
    return { data, error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear(); // Aggressively clear local storage to ensure session is gone
      resetRoles();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // Force navigation to auth page with full reload
      window.location.href = '/auth';
    }
    return { error: null };
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) console.error('Reset Password Error:', error);
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) console.error('Update Password Error:', error);
    return { error };
  };

  return {
    user,
    session,
    loading,
    isAdmin, // Legacy/Compat: True if Global Admin OR Org Manager
    organizationId,
    orgRole,
    organizationName, // Organization name for display
    isManager: ['super_manager', 'manager'].includes(orgRole || ''),
    isStaff: orgRole === 'staff',
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
  };
}
