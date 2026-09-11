import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import PageThumb from './PageThumb';
import { pageRuns, type PageGroup, type WorkspacePage, type WorkspaceSource } from '@/lib/workspaceDoc';

interface PageRailProps {
  pages: WorkspacePage[];
  groups: PageGroup[];
  sources: WorkspaceSource[];
  currentPageId: string | null;
  onSelect: (pageId: string) => void;
  onToggleGroup: (groupId: string) => void;
}

/**
 * The editor's page rail: the whole document, always, so the editor is never
 * stranded on one page.
 *
 * Reordering lives in the organiser rather than here -- dragging inside a
 * narrow rail while a page is open was the part that made the old sidebar feel
 * like a file list. Collapsed groups fold the rail down the same way they fold
 * the organiser, which is what makes a 300-page document scrollable.
 */
const PageRail = ({ pages, groups, sources, currentPageId, onSelect, onToggleGroup }: PageRailProps) => {
  const sourceById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const runs = useMemo(() => pageRuns(pages, groups), [pages, groups]);
  const currentRef = useRef<HTMLButtonElement>(null);

  // Follow the editor: opening page 180 from the organiser should not leave
  // the rail scrolled to the top.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentPageId]);

  const thumb = (page: WorkspacePage, position: number) => {
    const source = sourceById.get(page.sourceId);
    if (!source) return null;
    const isCurrent = page.id === currentPageId;

    return (
      <button
        key={page.id}
        ref={isCurrent ? currentRef : undefined}
        type="button"
        onClick={() => onSelect(page.id)}
        aria-current={isCurrent ? 'true' : undefined}
        className={`focus-ring relative w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:w-full ${
          isCurrent ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'
        }`}
      >
        <PageThumb
          sourceId={source.id}
          file={source.file}
          sourceIndex={page.sourceIndex}
          rotation={page.rotation}
        />
        <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow-sm">
          {position + 1}
        </span>
        {page.annotations.length > 0 && (
          <span
            className="absolute left-1 top-1 h-2 w-2 rounded-full bg-primary"
            title={`${page.annotations.length} annotation${page.annotations.length === 1 ? '' : 's'}`}
          />
        )}
      </button>
    );
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 sm:block sm:space-y-3 sm:overflow-visible sm:pb-0">
      {runs.map(run => {
        if (!run.group) {
          return run.pages.map((page, i) => thumb(page, run.start + i));
        }

        return (
          <div key={run.group.id} className="shrink-0 rounded-lg bg-muted/40 p-2 sm:shrink">
            <button
              type="button"
              onClick={() => onToggleGroup(run.group!.id)}
              aria-expanded={!run.group.collapsed}
              className="focus-ring flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-semibold text-foreground hover:bg-secondary"
            >
              {run.group.collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{run.group.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{run.pages.length}</span>
            </button>

            {!run.group.collapsed && (
              <div className="mt-2 flex gap-2 sm:block sm:space-y-2">
                {run.pages.map((page, i) => thumb(page, run.start + i))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PageRail;
