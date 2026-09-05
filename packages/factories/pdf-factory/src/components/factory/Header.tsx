import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, FileText, Home } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NAV_TOOLS, UPCOMING_TOOLS, WORKSPACE_TOOL } from '@/lib/tools';

const Header = () => {
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path;

  // min-h keeps the tap target comfortable on touch devices.
  const navLinkClass = (active: boolean) =>
    `focus-ring flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:min-h-[38px] ${
      active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
    }`;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="focus-ring flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block text-base font-semibold leading-tight text-foreground">PDF Factory</span>
            <span className="block text-xs leading-tight text-muted-foreground">Part of ToolFactory</span>
          </div>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          <Link to="/" className={`${navLinkClass(isActive('/'))} hidden sm:flex`}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>

          <Link
            to={WORKSPACE_TOOL.path!}
            className={`${navLinkClass(isActive(WORKSPACE_TOOL.path!))} hidden sm:flex`}
          >
            <WORKSPACE_TOOL.icon className="h-4 w-4" aria-hidden="true" />
            Workspace
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className={navLinkClass(location.pathname.startsWith('/factory/'))}>
              Tools
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Tools</DropdownMenuLabel>

              <DropdownMenuItem asChild className="sm:hidden">
                <Link to="/" className="cursor-pointer gap-2">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Home
                </Link>
              </DropdownMenuItem>

              {NAV_TOOLS.map((tool) => (
                <DropdownMenuItem key={tool.id} asChild>
                  <Link to={tool.path!} className="cursor-pointer gap-2">
                    <tool.icon className="h-4 w-4" aria-hidden="true" />
                    {tool.name}
                  </Link>
                </DropdownMenuItem>
              ))}

              {UPCOMING_TOOLS.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Coming soon
                  </DropdownMenuLabel>

                  {UPCOMING_TOOLS.map((tool) => (
                    <DropdownMenuItem key={tool.id} disabled className="gap-2">
                      <tool.icon className="h-4 w-4" aria-hidden="true" />
                      {tool.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
};

export default Header;
