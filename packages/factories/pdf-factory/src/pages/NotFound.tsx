import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Header from '@/components/factory/Header';
import { ToolCard } from '@/components/factory/ToolCard';
import { CONVERTER_TOOLS, WORKSPACE_TOOL } from '@/lib/tools';

const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="page-shell flex-1 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          The link may be out of date. Pick a tool below, or head back to the homepage.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            to={WORKSPACE_TOOL.path!}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
          >
            Open PDF Workspace
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            to="/"
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-background px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Back to home
          </Link>
        </div>

        <h2 className="mb-3 mt-12 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Other tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONVERTER_TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default NotFound;
