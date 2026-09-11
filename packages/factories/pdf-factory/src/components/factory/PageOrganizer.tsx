import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, FolderOpen, GripVertical, Layers, Plus } from 'lucide-react';
import { SortablePageCard } from './SortablePageCard';
import WorkspacePageCard from './WorkspacePageCard';
import {
  pageRuns,
  regroupMovedPage,
  type PageGroup,
  type WorkspacePage,
  type WorkspaceSource,
} from '@/lib/workspaceDoc';

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

interface PageOrganizerProps {
  pages: WorkspacePage[];
  groups: PageGroup[];
  sources: WorkspaceSource[];
  selectedIds: Set<string>;
  currentPageId: string | null;
  onPagesChange: (pages: WorkspacePage[]) => void;
  onOpenPage: (pageId: string) => void;
  onToggleSelect: (index: number, shiftKey: boolean) => void;
  onRotate: (pageId: string) => void;
  onRemove: (pageId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUngroup: (groupId: string) => void;
  onAdd?: () => void;
}

type Row =
  | { id: string; kind: 'page'; page: WorkspacePage; position: number }
  | { id: string; kind: 'group'; group: PageGroup; pages: WorkspacePage[]; start: number };

/**
 * The whole document, as pages.
 *
 * Groups are drawn as sections rather than as a second list: an expanded group
 * is a labelled band around its own pages, a collapsed one is a single bar
 * that drags as a unit. Both live in one sortable list, so a page can be moved
 * into or out of a group by dragging it and a hundred-page document can be
 * folded down to a handful of rows.
 */
const PageOrganizer = ({
  pages,
  groups,
  sources,
  selectedIds,
  currentPageId,
  onPagesChange,
  onOpenPage,
  onToggleSelect,
  onRotate,
  onRemove,
  onToggleGroup,
  onRenameGroup,
  onUngroup,
  onAdd,
}: PageOrganizerProps) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const sourceById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const showSourceName = sources.length > 1;

  const runs = useMemo(() => pageRuns(pages, groups), [pages, groups]);

  const rows = useMemo<Row[]>(
    () =>
      runs.flatMap<Row>(run =>
        run.group?.collapsed
          ? [{ id: `group:${run.group.id}`, kind: 'group', group: run.group, pages: run.pages, start: run.start }]
          : run.pages.map((page, i) => ({ id: page.id, kind: 'page', page, position: run.start + i })),
      ),
    [runs],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rows.findIndex(row => row.id === active.id);
    const newIndex = rows.findIndex(row => row.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(rows, oldIndex, newIndex);
    const flat = moved.flatMap(row => (row.kind === 'group' ? row.pages : [row.page]));

    const movedRow = rows[oldIndex];
    if (movedRow.kind !== 'page') {
      onPagesChange(flat);
      return;
    }

    // A page dropped inside a group's run joins it; anywhere else it leaves.
    const landedAt = flat.findIndex(page => page.id === movedRow.page.id);
    onPagesChange(landedAt === -1 ? flat : regroupMovedPage(flat, landedAt));
  };

  const renderPage = (page: WorkspacePage, position: number) => {
    const source = sourceById.get(page.sourceId);
    if (!source) return null;

    return (
      <SortablePageCard key={page.id} id={page.id}>
        {({ isDragging, handleProps }) => (
          <WorkspacePageCard
            page={page}
            source={source}
            pageNumber={position + 1}
            isSelected={selectedIds.has(page.id)}
            isCurrent={currentPageId === page.id}
            showSourceName={showSourceName}
            onOpen={() => onOpenPage(page.id)}
            onToggleSelect={event => {
              event.stopPropagation();
              onToggleSelect(position, event.shiftKey);
            }}
            onRotate={() => onRotate(page.id)}
            onRemove={() => onRemove(page.id)}
            isDragging={isDragging}
            dragHandleProps={handleProps}
          />
        )}
      </SortablePageCard>
    );
  };

  const groupHeader = (group: PageGroup, count: number, start: number, collapsed: boolean) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onToggleGroup(group.id)}
        className="focus-ring inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {renamingId === group.id ? (
        <input
          autoFocus
          defaultValue={group.name}
          onBlur={event => {
            onRenameGroup(group.id, event.target.value.trim() || group.name);
            setRenamingId(null);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setRenamingId(null);
          }}
          className="h-7 w-48 rounded border border-input bg-background px-2 text-sm shadow-sm focus:outline-none"
          aria-label="Group name"
        />
      ) : (
        <button
          type="button"
          onClick={() => setRenamingId(group.id)}
          className="focus-ring truncate rounded px-1 text-sm font-semibold text-foreground hover:underline"
          title="Rename this group"
        >
          {group.name}
        </button>
      )}

      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">
        {count} {count === 1 ? 'page' : 'pages'}
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {count === 1 ? `page ${start + 1}` : `pages ${start + 1}–${start + count}`}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => onUngroup(group.id)}
        className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Ungroup
      </button>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map(row => row.id)} strategy={rectSortingStrategy}>
        <div className="space-y-4">
          {runs.map(run => {
            if (run.group?.collapsed) {
              return (
                <SortablePageCard key={`group:${run.group.id}`} id={`group:${run.group.id}`}>
                  {({ isDragging, handleProps }) => (
                    <div
                      className={`flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 ${
                        isDragging ? 'opacity-50' : ''
                      }`}
                    >
                      <div
                        {...handleProps}
                        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
                        aria-label={`Drag the group ${run.group!.name} to reorder it`}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {groupHeader(run.group!, run.pages.length, run.start, true)}
                      </div>
                    </div>
                  )}
                </SortablePageCard>
              );
            }

            if (run.group) {
              return (
                <section
                  key={run.group.id}
                  className="rounded-xl border border-border bg-muted/20 p-3"
                  aria-label={run.group.name}
                >
                  <div className="mb-3">{groupHeader(run.group, run.pages.length, run.start, false)}</div>
                  <div className={GRID_CLASS}>
                    {run.pages.map((page, i) => renderPage(page, run.start + i))}
                  </div>
                </section>
              );
            }

            return (
              <div key={`run-${run.start}`} className={GRID_CLASS}>
                {run.pages.map((page, i) => renderPage(page, run.start + i))}
              </div>
            );
          })}

          {onAdd && (
            <div className={GRID_CLASS}>
              <button
                type="button"
                onClick={onAdd}
                className="factory-card focus-ring flex h-full min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted hover:text-primary"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                  <Plus className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="font-medium">Add more PDFs</span>
              </button>
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default PageOrganizer;
