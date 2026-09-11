import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MousePointer2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getRenderDoc } from '@/lib/pdfDocCache';
import { getCssFontFamily, type Annotation, type RatioRect } from '@/lib/annotations';

interface PDFPageEditorProps {
  /** The source file the page lives in. */
  file: File | null;
  /** Cache key for that file, so switching pages never reparses it. */
  sourceId: string | null;
  /** 0-based index of the page to edit inside that file. */
  sourceIndex: number;
  /**
   * The page's annotations, owned by the workspace. Keeping them out of this
   * component is what lets them stay attached to their page while the user
   * moves between pages, reorders them, or rotates them -- and what removed
   * the Save step that used to rewrite the file and bounce the editor back to
   * page one.
   */
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onRotate?: () => void;
  onDelete?: () => void;
  /** Document-order navigation, driven by the organiser rather than the file. */
  onPrevPage?: () => void;
  onNextPage?: () => void;
  positionLabel?: string;
  className?: string;
}

const PDFPageEditor = ({
  file,
  sourceId,
  sourceIndex,
  annotations,
  onAnnotationsChange,
  onRotate,
  onDelete,
  onPrevPage,
  onNextPage,
  positionLabel,
  className = '',
}: PDFPageEditorProps) => {
  const [tool, setTool] = useState<'none' | 'text' | 'rect' | 'select'>('select');
  const [color, setColor] = useState('#ef4444');
  const [borderSize, setBorderSize] = useState(2);
  const [opacity, setOpacity] = useState(25);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [fontSize, setFontSize] = useState(20);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{ action: 'move'|'resize', startX: number, startY: number, initialItemX: number, initialItemY: number, initialItemW?: number, initialItemH?: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  // State
  const [zoom, setZoom] = useState(1.0);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // The latest annotations, so an updater callback never closes over a stale
  // list when several edits land in the same gesture (drag, then resize).
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const setAnnotations = useCallback(
    (updater: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
      const next = typeof updater === 'function' ? updater(annotationsRef.current) : updater;
      annotationsRef.current = next;
      onAnnotationsChange(next);
    },
    [onAnnotationsChange]
  );

  // Handlers for selected item
  const deleteSelected = useCallback(() => {
    if (selectedIndex !== null) {
      setAnnotations(prev => prev.filter((_, idx) => idx !== selectedIndex));
      setSelectedIndex(null);
    }
  }, [selectedIndex, setAnnotations]);

  const updateSelectedProperty = <K extends keyof Annotation>(key: K, value: Annotation[K]) => {
     if (selectedIndex !== null) {
         setAnnotations(prev => {
             const newAnns = [...prev];
             newAnns[selectedIndex] = { ...newAnns[selectedIndex], [key]: value };
             return newAnns;
         });
     }
  };

  const handleColorChange = (c: string) => {
      setColor(c);
      updateSelectedProperty('color', c);
  };
  const handleOpacityChange = (o: number) => {
      setOpacity(o);
      updateSelectedProperty('opacity', o / 100);
  };
  const handleBorderSizeChange = (sz: number) => {
      setBorderSize(sz);
      updateSelectedProperty('borderWidth', sz);
      updateSelectedProperty('borderColor', sz > 0 ? color : 'transparent');
  };
  const handleFontFamilyChange = (f: string) => {
      setFontFamily(f);
      updateSelectedProperty('fontFamily', f);
  };
  const handleFontSizeChange = (sz: number) => {
      setFontSize(sz);
      updateSelectedProperty('fontSize', sz);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
          deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 }); // In Ratio coords
  const [currentRect, setCurrentRect] = useState<RatioRect | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  // Text draft state
  const [activeTextDraft, setActiveTextDraft] = useState<{ x: number, y: number, width?: number, height?: number, text: string } | null>(null);

  const resetTransientDrawState = () => {
    setSelectedIndex(null);
    setDragState(null);
    setIsDrawing(false);
    setCurrentRect(null);
  };

  // Drawing state belongs to the page on screen, so drop it whenever the
  // editor is pointed at a different page. Annotations are not touched here --
  // they live in the workspace and are addressed by page.
  useEffect(() => {
    setActiveTextDraft(null);
    resetTransientDrawState();
  }, [sourceId, sourceIndex]);

  // Load the source document. The cache means opening page 10 of a file whose
  // page 1 is already on screen costs nothing.
  useEffect(() => {
    pdfRef.current = null;

    if (!file || !sourceId) {
      setRenderKey(prev => prev + 1);
      return;
    }

    let cancelled = false;
    setIsLoadingDoc(true);
    (async () => {
      try {
        const pdf = await getRenderDoc(sourceId, file);
        if (cancelled) return;
        pdfRef.current = pdf;
      } catch (error) {
        console.error('Failed to load PDF for editing', error);
      } finally {
        if (!cancelled) {
          setIsLoadingDoc(false);
          setRenderKey(prev => prev + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, sourceId]);

  // Render the current page to the canvas whenever the page, zoom, or
  // underlying document changes.
  useEffect(() => {
    let renderTask: RenderTask | null = null;
    let isActive = true;
    const pdf = pdfRef.current;

    if (pdf && canvasRef.current) {
      const renderPage = async () => {
        try {
          const page = await pdf.getPage(sourceIndex + 1);

          if (!isActive) return;

          const viewport = page.getViewport({ scale: 1.5 * zoom });
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) return;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          context.clearRect(0, 0, canvas.width, canvas.height);

          renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
          });

          await renderTask.promise;
        } catch (error) {
            if (error instanceof Error && error.name === 'RenderingCancelledException') {
               // Normal cancel behavior
            } else {
               console.error("Error rendering page in editor", error);
            }
        }
      };
      renderPage();
    }

    return () => {
      isActive = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [renderKey, sourceIndex, zoom]);

  const getMousePosRatio = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();

    const x_px = e.clientX - rect.left;
    const y_px = e.clientY - rect.top;

    return {
      x: Math.max(0, Math.min(1, x_px / rect.width)),
      y: Math.max(0, Math.min(1, y_px / rect.height))
    };
  };

  const flushTextDraft = () => {
    setActiveTextDraft(prev => {
      if (prev && prev.text.trim()) {
        setAnnotations(curr => [...curr, {
          type: 'text',
          x: prev.x,
          y: prev.y,
          text: prev.text,
          color: color
        }]);
      }
      return null;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTextDraft) {
       flushTextDraft();
    }

    if (tool === 'select') {
      setSelectedIndex(null);
      return;
    }

    if (tool === 'none') return;
    setIsDrawing(true);
    const pos = getMousePosRatio(e);
    setStartPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'select' && dragState && selectedIndex !== null) {
        const pos = getMousePosRatio(e);
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;

        if (dragState.action === 'resize') {
            updateSelectedProperty('width', Math.max(0.01, dragState.initialItemW! + dx));
            updateSelectedProperty('height', Math.max(0.01, dragState.initialItemH! + dy));
        } else {
            updateSelectedProperty('x', dragState.initialItemX + dx);
            updateSelectedProperty('y', dragState.initialItemY + dy);
        }
        return;
    }

    if (!isDrawing) return;
    const pos = getMousePosRatio(e);
    setCurrentRect({
      x: Math.min(pos.x, startPos.x),
      y: Math.min(pos.y, startPos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y)
    });
  };

  const handleMouseUp = () => {
    if (dragState) {
        setDragState(null);
    }

    if (!isDrawing) return;
    if (currentRect) {
      if (tool === 'rect') {
        setAnnotations(prev => [...prev, {
          type: 'rect',
          ...currentRect,
          color: color,
          opacity: opacity / 100,
          borderColor: borderSize > 0 ? color : 'transparent',
          borderWidth: borderSize
        }]);
      } else if (tool === 'text') {
        setActiveTextDraft({
          ...currentRect,
          text: ''
        });
      }
      setCurrentRect(null);
    } else {
        if (tool === 'text') {
            setActiveTextDraft({ x: startPos.x, y: startPos.y, width: 0.2, height: 0.05, text: '' });
        }
    }
    setIsDrawing(false);
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2 shadow-sm z-10 sticky top-0">
          <Button
            variant={tool === 'select' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTool('select')}
          >
            <MousePointer2 className="mr-2 h-4 w-4" /> Select
          </Button>
          <Button
            variant={tool === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTool('text'); setSelectedIndex(null); }}
          >
            <Type className="mr-2 h-4 w-4" /> Text
          </Button>
          <Button
            variant={tool === 'rect' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTool('rect'); setSelectedIndex(null); }}
          >
            <Square className="mr-2 h-4 w-4" /> Box
          </Button>

          {positionLabel && (
            <div className="flex items-center gap-1 rounded-md bg-muted/50 px-1 py-1" title="Navigate pages">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (activeTextDraft) flushTextDraft();
                  onPrevPage?.();
                }}
                disabled={!onPrevPage}
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="whitespace-nowrap px-1 text-xs font-medium tabular-nums text-foreground">
                {positionLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (activeTextDraft) flushTextDraft();
                  onNextPage?.();
                }}
                disabled={!onNextPage}
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="mx-2 w-px h-6 bg-border hidden sm:block" />

          {/* Active Item Context Controls */}
          {selectedIndex !== null && (
              <Button variant="destructive" size="sm" onClick={deleteSelected} title="Delete Selected">
                 <Trash2 className="h-4 w-4" /> Delete
              </Button>
          )}

          {/* Customization Controls */}
          <div className="flex flex-wrap items-center gap-2 bg-muted/50 p-1 px-2 rounded-md">
             <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-7 h-7 p-0 border-0 rounded cursor-pointer shrink-0 bg-transparent"
                title="Choose Color"
             />

             <div className="h-4 w-px bg-border mx-1" />

             {(tool === 'rect' || (tool === 'select' && selectedIndex !== null && annotations[selectedIndex]?.type === 'rect')) ? (
                 <>
                     <select
                        value={borderSize}
                        onChange={(e) => handleBorderSizeChange(Number(e.target.value))}
                        className="h-7 w-24 rounded border border-input bg-background px-2 text-xs shadow-sm hidden sm:block"
                     >
                        <option value={0}>No Border</option>
                        <option value={1}>1px Border</option>
                        <option value={2}>2px Border</option>
                        <option value={4}>4px Border</option>
                        <option value={8}>8px Border</option>
                     </select>

                     <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

                     <div className="items-center gap-1.5 px-1 hidden lg:flex">
                        <span className="text-xs text-muted-foreground mr-1">Opacity</span>
                        <input
                           type="range"
                           min="0" max="100"
                           value={opacity}
                           onChange={(e) => handleOpacityChange(Number(e.target.value))}
                           className="w-20 accent-primary"
                        />
                        <span className="text-xs w-8 text-right tabular-nums text-muted-foreground">{opacity}%</span>
                     </div>
                 </>
             ) : (tool === 'text' || (tool === 'select' && selectedIndex !== null && annotations[selectedIndex]?.type === 'text')) ? (
                 <>
                     <select
                        value={fontFamily}
                        onChange={(e) => handleFontFamilyChange(e.target.value)}
                        className="h-7 w-28 rounded border border-input bg-background px-2 text-xs shadow-sm focus:outline-none"
                     >
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times-Roman">Times Roman</option>
                        <option value="Courier">Courier</option>
                     </select>

                     <div className="h-4 w-px bg-border mx-1" />

                     <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs text-muted-foreground">Size</span>
                        <input
                           type="number"
                           value={fontSize}
                           onChange={(e) => handleFontSizeChange(Number(e.target.value) || 20)}
                           className="h-7 w-16 rounded border border-input bg-background px-2 text-xs shadow-sm focus:outline-none"
                           min="8" max="120"
                        />
                     </div>
                 </>
             ) : (
                <span className="text-xs text-muted-foreground px-2">Select a tool or item</span>
             )}
          </div>

          <div className="mx-2 w-px h-6 bg-border hidden sm:block" />

          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Zoom Out">
             <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom In">
             <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="mx-2 w-px h-6 bg-border hidden sm:block" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
            className="hidden sm:flex"
          >
            <Undo className="mr-2 h-4 w-4" /> Undo
          </Button>

          {onRotate && (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onRotate} title="Rotate page (applied when you export -- the page card shows the turn; this editor preview stays unrotated so annotations keep their placement)">
                  <RotateCw className="h-4 w-4" />
              </Button>
              <span className="hidden text-xs text-muted-foreground sm:inline">Applied on export</span>
            </div>
          )}
          {onDelete && (
             <Button variant="ghost" size="sm" onClick={() => {
                 if (window.confirm("Are you sure you want to delete this page? This action cannot be undone.")) {
                     onDelete();
                 }
             }} className="text-destructive hover:text-destructive hidden sm:flex" title="Delete Page">
                <Trash2 className="h-4 w-4" />
             </Button>
          )}

          <div className="flex-1" />

          {/* No Save button: edits are held by the workspace and written into
              the document when it is exported. */}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {annotations.length > 0
              ? `${annotations.length} mark${annotations.length === 1 ? '' : 's'} on this page · applied on export`
              : 'Edits are applied when you export'}
          </span>
        </div>

        {/* Editor Canvas Area */}
        <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-4 sm:p-8 select-none">
            {isLoadingDoc ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Loading page…</p>
              </div>
            ) : (
            <div
                ref={containerRef}
                className="relative shadow-lg ring-1 ring-border my-auto bg-white transition-all duration-200 max-w-full"
                style={{ cursor: tool !== 'none' ? 'crosshair' : 'default' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                <canvas ref={canvasRef} className="block max-w-full" />

                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                    {annotations.map((ann, i) => (
                        <React.Fragment key={i}>
                            {ann.type === 'rect' && (
                                <React.Fragment>
                                    <rect
                                        x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                                        width={`${ann.width * 100}%`} height={`${ann.height * 100}%`}
                                        fill={ann.color} fillOpacity={ann.opacity ?? 0.25} stroke={ann.borderColor} strokeWidth={ann.borderWidth}
                                        vectorEffect="non-scaling-stroke"
                                        className={tool === 'select' ? 'cursor-pointer pointer-events-auto hover:opacity-80' : ''}
                                        onMouseDown={(e) => {
                                            if (tool === 'select') {
                                               e.stopPropagation();
                                               setSelectedIndex(i);
                                               const pos = getMousePosRatio(e);
                                               setDragState({
                                                   action: 'move',
                                                   startX: pos.x,
                                                   startY: pos.y,
                                                   initialItemX: ann.x,
                                                   initialItemY: ann.y
                                               });
                                               setColor(ann.color || '#ef4444');
                                               if (ann.opacity !== undefined) setOpacity(ann.opacity * 100);
                                               if (ann.borderWidth !== undefined) setBorderSize(ann.borderWidth);
                                            }
                                        }}
                                    />
                                    {selectedIndex === i && (
                                        <React.Fragment>
                                            <rect
                                                x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                                                width={`${ann.width * 100}%`} height={`${ann.height * 100}%`}
                                                fill="transparent"
                                                stroke="#3b82f6" strokeWidth={2} strokeDasharray="4,4"
                                                className="pointer-events-none"
                                            />
                                            <rect
                                                x={`${(ann.x + ann.width) * 100}%`}
                                                y={`${(ann.y + ann.height) * 100}%`}
                                                width="10" height="10"
                                                transform="translate(-5, -5)"
                                                fill="#ffffff" stroke="#3b82f6" strokeWidth={2}
                                                className="cursor-nwse-resize pointer-events-auto"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    const pos = getMousePosRatio(e);
                                                    setDragState({
                                                        action: 'resize',
                                                        startX: pos.x,
                                                        startY: pos.y,
                                                        initialItemX: ann.x,
                                                        initialItemY: ann.y,
                                                        initialItemW: ann.width,
                                                        initialItemH: ann.height
                                                    });
                                                }}
                                            />
                                        </React.Fragment>
                                    )}
                                </React.Fragment>
                            )}
                            {ann.type === 'text' && (
                                <text
                                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`}
                                    dy="1em"
                                    fontSize={ann.fontSize || 20}
                                    fontFamily={getCssFontFamily(ann.fontFamily || 'Helvetica')}
                                    fill={ann.color} fontWeight="normal"
                                    className={(tool === 'text' || tool === 'select') ? 'cursor-pointer pointer-events-auto hover:opacity-80 transition-opacity' : ''}
                                    style={selectedIndex === i ? { filter: 'drop-shadow(0px 0px 3px #3b82f6)' } : undefined}
                                    onMouseDown={(e) => {
                                        if (tool === 'text') {
                                            e.stopPropagation();
                                            setActiveTextDraft({
                                                x: ann.x, y: ann.y,
                                                width: ann.width, height: ann.height,
                                                text: ann.text
                                            });
                                            setColor(ann.color);
                                            if (ann.fontFamily) setFontFamily(ann.fontFamily);
                                            if (ann.fontSize) setFontSize(ann.fontSize);
                                            setAnnotations(prev => prev.filter((_, idx) => idx !== i));
                                        } else if (tool === 'select') {
                                            e.stopPropagation();
                                            setSelectedIndex(i);
                                            const pos = getMousePosRatio(e);
                                            setDragState({
                                                action: 'move',
                                                startX: pos.x,
                                                startY: pos.y,
                                                initialItemX: ann.x,
                                                initialItemY: ann.y
                                            });
                                            setColor(ann.color || '#ef4444');
                                            if (ann.fontFamily) setFontFamily(ann.fontFamily);
                                            if (ann.fontSize) setFontSize(ann.fontSize);
                                        }
                                    }}
                                    onDoubleClick={(e) => {
                                        if (tool === 'select') {
                                            e.stopPropagation();
                                            setActiveTextDraft({
                                                x: ann.x, y: ann.y,
                                                width: ann.width, height: ann.height,
                                                text: ann.text
                                            });
                                            setAnnotations(prev => prev.filter((_, idx) => idx !== i));
                                            setSelectedIndex(null);
                                        }
                                    }}
                                >
                                    {ann.text}
                                </text>
                            )}
                        </React.Fragment>
                    ))}
                    {currentRect && (
                        <rect
                            x={`${currentRect.x * 100}%`} y={`${currentRect.y * 100}%`}
                            width={`${currentRect.width * 100}%`} height={`${currentRect.height * 100}%`}
                            fill={tool === 'text' ? 'transparent' : color}
                            fillOpacity={tool === 'text' ? 1 : opacity / 100}
                            stroke={tool === 'text' ? color : (borderSize > 0 ? color : 'transparent')}
                            strokeWidth={borderSize > 0 ? borderSize : 2}
                            strokeDasharray={tool === 'text' ? "5,5" : (borderSize === 0 ? "5,5" : undefined)}
                        />
                    )}
                </svg>

                {/* Inline Text Input overlay */}
                {activeTextDraft && (
                    <textarea
                       autoFocus
                       value={activeTextDraft.text}
                       onChange={e => setActiveTextDraft(prev => prev ? { ...prev, text: e.target.value } : null)}
                       onBlur={flushTextDraft}
                       onMouseDown={e => e.stopPropagation()} // Fix: Prevent canvas from aborting editing immediately
                       className="absolute bg-white/80 border border-dashed border-primary outline-none p-1 m-0 resize-none overflow-hidden hover:bg-white focus:bg-white"
                       style={{
                          left: `${activeTextDraft.x * 100}%`,
                          top: `${activeTextDraft.y * 100}%`,
                          width: activeTextDraft.width ? `${activeTextDraft.width * 100}%` : 'auto',
                          height: activeTextDraft.height ? `${activeTextDraft.height * 100}%` : 'auto',
                          minWidth: '100px',
                          color: color,
                          fontFamily: getCssFontFamily(fontFamily),
                          fontSize: `${fontSize}px`,
                          fontWeight: 'normal',
                          pointerEvents: 'auto'
                       }}
                    />
                )}
            </div>
            )}
        </div>
    </div>
  );
};

export default PDFPageEditor;
