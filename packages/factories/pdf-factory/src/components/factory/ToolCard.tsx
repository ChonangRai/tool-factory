import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Tool } from '@/lib/tools';

// Base holds no colours so state variants can't lose a Tailwind specificity
// fight with them (bg-muted vs bg-primary/10 is resolved by stylesheet order,
// not class order, which previously left disabled tiles looking active).
const iconTile = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors';

/**
 * A live tool renders as a single anchor so the whole card is clickable,
 * keyboard-focusable, and supports open-in-new-tab / copy-link. A "soon" tool
 * renders as a plain element with no interactive affordance at all.
 */
export const ToolCard = ({ tool }: { tool: Tool }) => {
  if (tool.status === 'soon' || !tool.path) {
    return (
      <div
        aria-disabled="true"
        className="flex h-full cursor-not-allowed flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`${iconTile} bg-muted text-muted-foreground/70`}>
            <tool.icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-muted-foreground">{tool.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground/80">{tool.description}</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={tool.path}
      className="group interactive-card focus-ring flex h-full flex-col gap-3 p-5"
    >
      <div className={`${iconTile} bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground`}>
        <tool.icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-foreground">{tool.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Open tool
        <ArrowRight
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
};

/** Wider, higher-emphasis version used for the primary workspace entry point. */
export const FeaturedToolCard = ({ tool }: { tool: Tool }) => {
  if (!tool.path) return null;

  return (
    <Link
      to={tool.path}
      className="group interactive-card focus-ring flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <tool.icon className="h-7 w-7" aria-hidden="true" />
      </div>

      <div className="flex-1">
        <h3 className="text-xl font-semibold text-foreground">{tool.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>

        {tool.capabilities && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {tool.capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {capability}
              </li>
            ))}
          </ul>
        )}
      </div>

      <span className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5">
        Open workspace
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
};
