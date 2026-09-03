import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortablePageCardProps {
  id: string;
  className?: string;
  children: (opts: {
    isDragging: boolean;
    handleProps: React.HTMLAttributes<HTMLDivElement> & { ref: (el: HTMLElement | null) => void };
  }) => ReactNode;
}

export const SortablePageCard = ({ id, className, children }: SortablePageCardProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({
        isDragging,
        handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
      })}
    </div>
  );
};
