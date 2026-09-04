import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Meta line shown under the title, e.g. a file or page count. */
  meta?: ReactNode;
  backTo?: { href: string; label: string };
  /** Primary actions, right-aligned on wider screens. */
  actions?: ReactNode;
}

const PageHeader = ({ title, description, meta, backTo, actions }: PageHeaderProps) => (
  <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {backTo && (
        <Link
          to={backTo.href}
          className="focus-ring -ml-1 mb-2 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backTo.label}
        </Link>
      )}
      <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {meta && <div className="mt-1 text-sm text-muted-foreground">{meta}</div>}
    </div>

    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default PageHeader;
