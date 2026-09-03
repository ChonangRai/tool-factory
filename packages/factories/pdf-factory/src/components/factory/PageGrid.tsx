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
import PageCard from './PageCard';
import { SortablePageCard } from './SortablePageCard';
import { Plus } from 'lucide-react';

interface Page {
  id: string;
  pageNumber: number;
  rotation: number;
  file?: File;
}

interface PageGridProps {
  pages: Page[];
  onReorder: (pages: Page[]) => void;
  onRotate: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  onAdd?: () => void;
}

const PageGrid = ({ pages, onReorder, onRotate, onRemove, onEdit, onAdd }: PageGridProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(pages, oldIndex, newIndex).map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    }));

    onReorder(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pages.map((page) => (
            <SortablePageCard key={page.id} id={page.id}>
              {({ isDragging, handleProps }) => (
                <PageCard
                  pageNumber={page.pageNumber}
                  rotation={page.rotation}
                  file={page.file}
                  onRotate={() => onRotate(page.id)}
                  onRemove={() => onRemove(page.id)}
                  onEdit={() => onEdit(page.id)}
                  isDragging={isDragging}
                  dragHandleProps={handleProps}
                />
              )}
            </SortablePageCard>
          ))}

          {onAdd && (
            <div
              onClick={onAdd}
              className="factory-card aspect-[3/4] flex flex-col items-center justify-center gap-3 border-2 border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground transition-all hover:bg-muted hover:border-primary/50 hover:text-primary cursor-pointer"
            >
              <div className="h-12 w-12 rounded-full bg-background flex items-center justify-center shadow-sm">
                <Plus className="h-6 w-6" />
              </div>
              <span className="font-medium">Add more PDFs</span>
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default PageGrid;
