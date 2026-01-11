import { useState } from 'react';
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

const SidebarList = ({ pages, selectedId, onSelect, onReorder }: SidebarListProps) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag image or just default
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

    // Update page numbers implicitly via order, parent handles ID/File mapping
    // But we need to pass back the reordered array
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
    <div className="space-y-3">
      {pages.map((page) => (
        <div 
            key={page.id} 
            draggable
            onDragStart={(e) => handleDragStart(e, page.id)}
            onDragOver={(e) => handleDragOver(e, page.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, page.id)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(page.id)}
            className={`
                relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer 
                ${selectedId === page.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'}
                ${dragOverId === page.id ? 'border-t-4 border-t-primary mt-4' : ''} 
                ${draggedId === page.id ? 'opacity-50' : ''}
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
      ))}
    </div>
  );
};

export default SidebarList;
