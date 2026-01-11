import { useState } from 'react';
import PageCard from './PageCard';
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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = pages.findIndex(p => p.id === draggedId);
    const targetIndex = pages.findIndex(p => p.id === targetId);

    const newPages = [...pages];
    const [draggedPage] = newPages.splice(draggedIndex, 1);
    newPages.splice(targetIndex, 0, draggedPage);

    // Update page numbers
    const reorderedPages = newPages.map((page, index) => ({
      ...page,
      pageNumber: index + 1
    }));

    onReorder(reorderedPages);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {pages.map((page) => (
        <div
          key={page.id}
          draggable
          onDragStart={(e) => handleDragStart(e, page.id)}
          onDragOver={(e) => handleDragOver(e, page.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, page.id)}
          onDragEnd={handleDragEnd}
          className={`transition-transform duration-200 ${
            dragOverId === page.id ? 'scale-95 opacity-50' : ''
          }`}
        >
          <PageCard
            pageNumber={page.pageNumber}
            rotation={page.rotation}
            file={page.file}
            onRotate={() => onRotate(page.id)}
            onRemove={() => onRemove(page.id)}
            onEdit={() => onEdit(page.id)}
            isDragging={draggedId === page.id}
          />
        </div>
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
  );
};

export default PageGrid;
