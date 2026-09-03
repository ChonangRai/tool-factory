import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PageCard from './PageCard';

interface Page {
  id: string;
  pageNumber: number;
  rotation: number;
  file?: File;
}

interface SidebarListProps {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (pages: Page[]) => void;
}

interface SortableRowProps {
  page: Page;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const SortableRow = ({ page, isSelected, onSelect }: SortableRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(page.id)}
      className={`
          relative w-28 shrink-0 sm:w-auto rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing touch-none
          ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'}
          ${isDragging ? 'opacity-50' : ''}
      `}
    >
      <div className="pointer-events-none">
        <PageCard
          pageNumber={page.pageNumber}
          rotation={page.rotation}
          file={page.file}
          onRotate={() => {}}
          onRemove={() => {}}
          onEdit={() => {}}
        />
      </div>
    </div>
  );
};

const SidebarList = ({ pages, selectedId, onSelect, onReorder }: SidebarListProps) => {
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
        <div className="flex gap-3 overflow-x-auto pb-1 sm:block sm:space-y-3 sm:overflow-visible sm:pb-0">
          {pages.map((page) => (
            <SortableRow key={page.id} page={page} isSelected={selectedId === page.id} onSelect={onSelect} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default SidebarList;
