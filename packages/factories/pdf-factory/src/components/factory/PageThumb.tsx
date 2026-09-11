import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { getRenderDoc } from '@/lib/pdfDocCache';

// The thumbnail well is a fixed portrait box so the grid never reflows when a
// page is rotated. Rotating the well itself pushed a 3:4 box sideways out of
// the card (which clips), cropping quarter turns -- so the well now stays put
// and an inner frame rotates instead. For 90/270 that frame's dimensions are
// swapped: a frame sized height x width has, once turned a quarter turn, a
// bounding box of exactly width x height, so it lands back inside the well.
const THUMB_ASPECT_W = 3;
const THUMB_ASPECT_H = 4;
const QUARTER_TURN_WIDTH = `${(THUMB_ASPECT_H / THUMB_ASPECT_W) * 100}%`;
const QUARTER_TURN_HEIGHT = `${(THUMB_ASPECT_W / THUMB_ASPECT_H) * 100}%`;

/** Wide enough to stay crisp on a retina card, small enough for 300 of them. */
const THUMB_WIDTH = 220;

interface PageThumbProps {
  sourceId: string;
  file: File;
  /** 0-based page index inside the source file. */
  sourceIndex: number;
  rotation: number;
  className?: string;
}

/**
 * One page of one source, rendered only once it is close to the viewport.
 *
 * A 300-page organiser cannot afford a canvas per page up front, so each card
 * waits for an IntersectionObserver hit and then renders at thumbnail width
 * from the shared document (see `pdfDocCache`) rather than re-parsing the file.
 */
const PageThumb = ({ sourceId, file, sourceIndex, rotation, className = '' }: PageThumbProps) => {
  const wellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNear, setIsNear] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const frameStyle: React.CSSProperties = {
    width: isQuarterTurn ? QUARTER_TURN_WIDTH : '100%',
    height: isQuarterTurn ? QUARTER_TURN_HEIGHT : '100%',
    transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg)`,
  };

  useEffect(() => {
    const well = wellRef.current;
    if (!well || isNear) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      // A screen of lead-in, so scrolling rarely lands on an empty card.
      { rootMargin: '600px' },
    );

    observer.observe(well);
    return () => observer.disconnect();
  }, [isNear]);

  useEffect(() => {
    if (!isNear) return;

    let active = true;
    let renderTask: { cancel: () => void } | null = null;

    (async () => {
      try {
        const doc = await getRenderDoc(sourceId, file);
        if (!active) return;

        const page = await doc.getPage(sourceIndex + 1);
        if (!active || !canvasRef.current) return;

        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const task = page.render({ canvasContext: context, viewport, canvas });
        renderTask = task;
        await task.promise;
        if (active) setIsRendered(true);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'RenderingCancelledException')) {
          console.error('Error rendering page thumbnail', error);
        }
      }
    })();

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [isNear, sourceId, file, sourceIndex]);

  return (
    <div
      ref={wellRef}
      className={`relative aspect-[3/4] w-full overflow-hidden bg-secondary ${className}`}
    >
      <div className="absolute left-1/2 top-1/2 flex items-center justify-center" style={frameStyle}>
        <canvas
          ref={canvasRef}
          className={`pointer-events-none h-full w-full object-contain transition-opacity duration-300 ${
            isRendered ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {!isRendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-5 w-5 text-primary/40" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PageThumb;
