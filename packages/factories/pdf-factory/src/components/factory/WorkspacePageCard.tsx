import { GripVertical, Pencil, RotateCw, Trash2 } from 'lucide-react';
import PageThumb from './PageThumb';
import { Checkbox } from '@/components/ui/checkbox';
import type { WorkspacePage, WorkspaceSource } from '@/lib/workspaceDoc';

interface WorkspacePageCardProps {
  page: WorkspacePage;
  source: WorkspaceSource;
  /** 1-based position in the document. */
  pageNumber: number;
  isSelected: boolean;
  isCurrent: boolean;
  /** Shown when the workspace holds more than one source file. */
  showSourceName: boolean;
  onOpen: () => void;
  onToggleSelect: (event: React.MouseEvent) => void;
  onRotate: () => void;
  onRemove: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> };
}

const WorkspacePageCard = ({
  page,
  source,
  pageNumber,
  isSelected,
  isCurrent,
  showSourceName,
  onOpen,
  onToggleSelect,
  onRotate,
  onRemove,
  isDragging = false,
  dragHandleProps,
}: WorkspacePageCardProps) => {
  const annotationCount = page.annotations.length;

  return (
    <div
      data-page-id={page.id}
      className={`factory-card group relative ${isDragging ? 'dragging' : ''} ${
        isCurrent ? 'ring-2 ring-primary' : isSelected ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <div
        {...dragHandleProps}
        className="absolute left-1 top-1 z-20 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 opacity-100 transition-opacity hover:bg-background/80 hover:text-foreground active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Drag page ${pageNumber} to reorder`}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </div>

      {/* Selection is a separate target from opening, so clicking a page never
          has to mean two things at once. */}
      <div
        className="absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-md bg-background/90 p-1 shadow-sm"
        onClick={onToggleSelect}
      >
        <Checkbox
          checked={isSelected}
          aria-label={`Select page ${pageNumber}`}
          // The wrapper handles the click so shift-range selection works.
          className="pointer-events-none"
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit page ${pageNumber}${page.rotation ? `, rotated ${((page.rotation % 360) + 360) % 360} degrees` : ''}`}
        aria-current={isCurrent ? 'true' : undefined}
        className="focus-ring block w-full cursor-pointer"
      >
        <PageThumb
          sourceId={source.id}
          file={source.file}
          sourceIndex={page.sourceIndex}
          rotation={page.rotation}
        />
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5 text-xs">
        <span className="font-medium tabular-nums text-foreground">{pageNumber}</span>
        {showSourceName && (
          <span className="truncate text-muted-foreground" title={source.name}>
            {source.name}
          </span>
        )}
        {annotationCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
            title={`${annotationCount} annotation${annotationCount === 1 ? '' : 's'} on this page`}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            {annotationCount}
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={onRotate}
          className="factory-icon-btn focus-ring"
          title="Rotate 90°"
          aria-label={`Rotate page ${pageNumber} 90 degrees`}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="factory-icon-btn destructive focus-ring bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
          title="Delete page"
          aria-label={`Delete page ${pageNumber}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default WorkspacePageCard;
