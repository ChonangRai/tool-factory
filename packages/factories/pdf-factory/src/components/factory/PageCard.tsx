import { useState, useEffect, useRef } from 'react';
import { RotateCw, Trash2, GripVertical, FileText } from 'lucide-react';
import pdfjsLib from '@/lib/pdfWorker';

// The thumbnail well is a fixed portrait box so the grid never reflows when a
// page is rotated. Rotating the well itself pushed a 3:4 box sideways out of
// the card (which clips), cropping quarter turns -- so the well now stays put
// and an inner frame rotates instead. For 90/270 that frame's dimensions are
// swapped: a frame sized height x width has, once turned a quarter turn, a
// bounding box of exactly width x height, so it lands back inside the well.
const THUMB_ASPECT_W = 3;
const THUMB_ASPECT_H = 4;
// As percentages of the well, whose height is (H/W) x its own width.
const QUARTER_TURN_WIDTH = `${(THUMB_ASPECT_H / THUMB_ASPECT_W) * 100}%`;
const QUARTER_TURN_HEIGHT = `${(THUMB_ASPECT_W / THUMB_ASPECT_H) * 100}%`;

interface PageCardProps {
  pageNumber: number;
  rotation: number;
  file?: File;
  onRotate: () => void;
  onRemove: () => void;
  onEdit: () => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> };
}

const PageCard = ({ pageNumber, rotation, file, onRotate, onRemove, onEdit, isDragging = false, dragHandleProps }: PageCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailGenerated, setThumbnailGenerated] = useState(false);
  const [pageCount, setPageCount] = useState<number>(0);

  // Rotation is stored as a plain accumulating number, so normalise before
  // branching on it -- 450, or a future negative turn, still reads as quarter.
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const frameStyle: React.CSSProperties = {
    width: isQuarterTurn ? QUARTER_TURN_WIDTH : '100%',
    height: isQuarterTurn ? QUARTER_TURN_HEIGHT : '100%',
    transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg)`,
  };

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
          await page.render({
            canvasContext: context,
            viewport: viewport,
          } as any).promise;
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

  const openLabel = file ? `Open ${file.name} in the editor` : `Open page ${pageNumber} in the editor`;

  return (
    <div
      className={`factory-card group ${isDragging ? 'dragging' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag Handle (always visible on touch, hover-revealed on desktop) */}
      <div
        {...dragHandleProps}
        className={`absolute left-1 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-md cursor-grab touch-none active:cursor-grabbing text-muted-foreground/60 hover:text-foreground hover:bg-background/80 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
          isHovered ? 'sm:opacity-100' : ''
        }`}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail Container -- fixed size, and never rotated itself */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={normalizedRotation ? `${openLabel} (rotated ${normalizedRotation} degrees)` : openLabel}
        className="focus-ring relative aspect-[3/4] w-full overflow-hidden bg-secondary cursor-pointer"
      >
        {/* Rotating frame: dimensions swap on quarter turns so nothing crops */}
        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center"
          style={frameStyle}
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
        </div>

      </button>

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
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRotate();
          }}
          className="factory-icon-btn focus-ring"
          title="Rotate 90°"
          aria-label={file ? `Rotate ${file.name} 90 degrees` : 'Rotate 90 degrees'}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Remove ${file?.name ?? 'this page'}? This cannot be undone.`)) {
              onRemove();
            }
          }}
          className="factory-icon-btn destructive focus-ring bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
          title="Remove"
          aria-label={file ? `Remove ${file.name}` : 'Remove page'}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default PageCard;
