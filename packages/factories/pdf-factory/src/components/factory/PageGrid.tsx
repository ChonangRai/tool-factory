import { useState } from 'react';
import PageCard from './PageCard';

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
}

const PageGrid = ({ pages, onReorder, onRotate, onRemove, onEdit }: PageGridProps) => {
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

  if (pages.length === 0) {
    return null;
  }

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
    </div>
  );
};

export default PageGrid;
