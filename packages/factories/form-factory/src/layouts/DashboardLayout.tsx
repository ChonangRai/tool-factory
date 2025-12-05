import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  Menu,
  X,
  ChevronRight,
  Building2,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardLayout() {
  const { signOut, user, isManager, organizationId } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: 'Forms',
      href: '/dashboard/forms',
      icon: FileText,
    },
    // Only show User Management to Managers
    ...(isManager ? [{
      label: 'User Management',
      href: '/dashboard/users',
      icon: Users,
    }] : []),
    {
      label: 'Archived',
      href: '/dashboard/archived',
      icon: Archive,
    },
    {
      label: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-white border-r shadow-sm transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-64",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="h-16 flex items-center px-4 border-b justify-between">
            {!isCollapsed && (
              <div className="flex items-center">
                <Building2 className="h-6 w-6 text-primary mr-2" />
                <span className="font-bold text-lg">FormFiller</span>
              </div>
            )}
            {isCollapsed && <Building2 className="h-6 w-6 text-primary mx-auto" />}
            
            {/* Collapse Toggle - Desktop only */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.exact}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  isCollapsed && "justify-center"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className={cn("h-5 w-5", !isCollapsed && "mr-3")} />
                {!isCollapsed && item.label}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50">
            {!isCollapsed ? (
              <>
                <div className="flex items-center mb-4 px-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-3">
                    {user?.email?.[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.user_metadata?.name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="icon"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleSignOut}
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div 
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300",
          isCollapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        {/* Mobile Header */}
        <header className="lg:hidden h-16 bg-white border-b flex items-center px-4 justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <span className="ml-2 font-bold text-lg">FormFiller</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
