import { useState, useEffect, useRef } from 'react';
import { RotateCw, Trash2, GripVertical } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker - using a CDN for simplicity in this setup, or we could copy the worker file
// For production, it's better to bundle the worker.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PageCardProps {
  pageNumber: number;
  rotation: number;
  file?: File;
  onRotate: () => void;
  onRemove: () => void;
  onEdit: () => void;
  isDragging?: boolean;
}

const PageCard = ({ pageNumber, rotation, file, onRotate, onRemove, onEdit, isDragging = false }: PageCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailGenerated, setThumbnailGenerated] = useState(false);
  
  // ... (useEfffect remains same)

  return (
    <div
      className={`factory-card group ${isDragging ? 'dragging' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ... (Drag handle remains same) */}
      
      {/* ... (Thumbnail div remains same) */}
      <div 
        className="relative aspect-[3/4] w-full overflow-hidden bg-secondary flex items-center justify-center cursor-pointer"
        style={{ transform: `rotate(${rotation}deg)` }}
        onClick={onEdit} // Click on card triggers edit
      >
        {file ? (
           <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />
        ) : (
          /* Fallback Mock Content */
          <div className="absolute inset-4 flex flex-col gap-2">
             {/* ... */}
          </div>
        )}
        
        {/* Overlay with Edit Button on hover (centered) */}
        <div className={`absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
           <span className="bg-white/90 text-foreground text-xs font-medium px-2 py-1 rounded shadow-sm">
             Click to Edit
           </span>
        </div>
      </div>

      {/* ... (Page number label remains same) */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
          {/* ... */}
      </div>

      {/* Action Buttons - Always visible on mobile, visible on hover desktop */}
      <div 
        className={`absolute right-2 top-2 flex flex-col gap-1 transition-opacity duration-150 ${
          isHovered ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRotate();
          }}
          className="factory-icon-btn"
          title="Rotate 90°"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="factory-icon-btn destructive bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
          title="Remove file"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PageCard;
