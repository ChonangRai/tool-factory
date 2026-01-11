import { useState, useEffect, useRef } from 'react';
import { RotateCw, Trash2, GripVertical, FileText } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker - using unpkg for specific version matching
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
  const [pageCount, setPageCount] = useState<number>(0);

  useEffect(() => {
    let active = true;

    const renderPage = async () => {
      if (!file || !canvasRef.current) return;

      try {
        const fileData = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(fileData).promise;
        
        if (!active) return;
        setPageCount(pdf.numPages);

        const page = await pdf.getPage(1); // Always preview page 1 for the thumbnail
        
        if (!active) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        // Calculate scale to fit container width (approx 300px for card)
        // We render at 1.5x for crispness on retina
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          await page.render(renderContext).promise;
          if (active) setThumbnailGenerated(true);
        }
      } catch (error) {
        console.error('Error rendering PDF page:', error);
      }
    };

    renderPage();

    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div
      className={`factory-card group ${isDragging ? 'dragging' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag Handle (Visible on hover or mobile) */}
      <div 
        className={`absolute left-2 top-2 z-20 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0 sm:opacity-0'
        }`}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail Container */}
      <div 
        className="relative aspect-[3/4] w-full overflow-hidden bg-secondary flex items-center justify-center cursor-pointer"
        style={{ transform: `rotate(${rotation}deg)` }}
        onClick={onEdit} 
      >
        {file ? (
           <>
             {/* Canvas for thumbnail */}
             <canvas ref={canvasRef} className={`w-full h-full object-contain pointer-events-none ${thumbnailGenerated ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`} />
             
             {/* Fallback Icon */}
             {!thumbnailGenerated && (
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary/50" />
                   </div>
                </div>
             )}
           </>
        ) : (
          /* Empty State */
          <div className="absolute inset-4 flex flex-col gap-2 opacity-50">
             <div className="h-2 w-full rounded bg-muted-foreground/20" />
             <div className="h-2 w-3/4 rounded bg-muted-foreground/20" />
             <div className="h-2 w-full rounded bg-muted-foreground/20" />
          </div>
        )}
        
        {/* Overlay with Edit Button */}
        <div className={`absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
           <span className="bg-white/90 text-foreground text-xs font-medium px-2 py-1 rounded shadow-sm">
             Click to Edit
           </span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex flex-col border-t border-border px-3 py-2 text-xs">
          <div className="flex items-center justify-between font-medium text-foreground">
             <span className="truncate max-w-[120px]" title={file?.name}>
                {file?.name || `Page ${pageNumber}`}
             </span>
             <span className="text-muted-foreground ml-2 shrink-0">
                {pageCount > 1 ? `${pageCount} pgs` : ''}
             </span>
          </div>
      </div>

      {/* Action Buttons */}
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
