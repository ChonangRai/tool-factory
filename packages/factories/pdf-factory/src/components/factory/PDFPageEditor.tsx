import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Type, Square, Save, Undo, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface PDFPageEditorProps {
  file: File | null;
  onSave: (newFile: File) => void;
  onRotate?: () => void;
  onDelete?: () => void;
  className?: string;
}

const PDFPageEditor = ({ file, onSave, onRotate, onDelete, className = '' }: PDFPageEditorProps) => {
  const [tool, setTool] = useState<'none' | 'text' | 'rect'>('none');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [zoom, setZoom] = useState(1.0);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 }); // In Ratio coords
  const [currentRect, setCurrentRect] = useState<any>(null); // In Ratio coords
  const [renderKey, setRenderKey] = useState(0);

  // Reset annotations when file changes
  useEffect(() => {
    setAnnotations([]);
    setZoom(1.0);
    setRenderKey(prev => prev + 1);
  }, [file]);
  
  // Render PDF to Canvas
  useEffect(() => {
    if (file && canvasRef.current) {
      const renderPage = async () => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          
          // Use Zoom level for scale
          // Standard scale 1.5 * zoom for quality
          const viewport = page.getViewport({ scale: 1.5 * zoom });
          const canvas = canvasRef.current;
          if (!canvas) return;
          
          const context = canvas.getContext('2d');
          if (!context) return;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          // Clear previous content
          context.clearRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: context,
            viewport: viewport
          } as any).promise;
        } catch (error) {
            console.error("Error rendering page in editor", error);
        }
      };
      renderPage();
    }
  }, [file, renderKey, zoom]);
  
  // Helper: Convert Event Client Pos to Ratio Coords (0-1)
  const getMousePosRatio = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Relative position in pixels within the displayed canvas
    const x_px = e.clientX - rect.left;
    const y_px = e.clientY - rect.top;
    
    // Convert to Ratio (0-1)
    return {
      x: Math.max(0, Math.min(1, x_px / rect.width)),
      y: Math.max(0, Math.min(1, y_px / rect.height))
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'none') return;
    setIsDrawing(true);
    const pos = getMousePosRatio(e);
    setStartPos(pos);
    
    if (tool === 'text') {
      const text = prompt("Enter text:");
      if (text) {
        setAnnotations(prev => [...prev, {
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: text,
          size: 0.03, // Relative size... tricky. Let's start with approx 20px at normal scale?
          color: 'red'
        }]);
      }
      setIsDrawing(false); 
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || tool !== 'rect') return;
    const pos = getMousePosRatio(e);
    setCurrentRect({
      x: Math.min(pos.x, startPos.x),
      y: Math.min(pos.y, startPos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y)
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    if (tool === 'rect' && currentRect) {
      setAnnotations(prev => [...prev, {
        type: 'rect',
        ...currentRect,
        color: 'rgba(255, 0, 0, 0.3)',
        borderColor: 'red'
      }]);
      setCurrentRect(null);
    }
    setIsDrawing(false);
  };
  
  const handleSave = async () => {
    if (!file) return;
    
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      
      const { width, height } = firstPage.getSize();
      
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Apply annotations using Ratio coords -> PDF coords
      for (const ann of annotations) {
        // PDF X = ratio * width
        // PDF Y = height - (ratio * height)  [since PDF Origin is Bottom-Left]
        
        const pdfX = ann.x * width;
        // Correct Y conversion: 
        // Canvas Y=0 is TOP. PDF Y=0 is BOTTOM.
        // Canvas Ratio Y=0.1 means 10% from Top.
        // PDF Ratio Y needs to be 90% from Bottom?
        // pdfY = height - (ann.y * height)
        const pdfY_Top = ann.y * height; // distance from top in PDF units
        
        if (ann.type === 'rect') {
           const w = ann.width * width;
           const h = ann.height * height;
           
           // drawRectangle x,y is bottom-left corner of rect
           // If we have top-left relative to page top...
           // y = height - top_y - h
           
           firstPage.drawRectangle({
             x: pdfX,
             y: height - pdfY_Top - h,
             width: w,
             height: h,
             borderColor: rgb(1, 0, 0),
             color: rgb(1, 0, 0),
             borderWidth: 2,
             opacity: 0.3,
           });
        }
        else if (ann.type === 'text') {
           // drawText x,y is baseline origin? Usually bottom-left.
           const fontSize = 20; // Fixed font size for now or scale relative to width?
           // text ann.size was 0.03
           
           firstPage.drawText(ann.text, {
             x: pdfX,
             y: height - pdfY_Top - fontSize, // approximate top alignment
             size: fontSize, 
             font: helveticaFont,
             color: rgb(1, 0, 0),
           });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const newFile = new File([pdfBytes as any], file.name, { type: 'application/pdf' });
      onSave(newFile);
    } catch (e) {
      console.error("Failed to save annotations", e);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b bg-card p-2 shadow-sm z-10 sticky top-0">
          <Button 
            variant={tool === 'text' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTool('text')}
          >
            <Type className="mr-2 h-4 w-4" /> Text
          </Button>
          <Button 
            variant={tool === 'rect' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTool('rect')}
          >
            <Square className="mr-2 h-4 w-4" /> Box
          </Button>
          
          <div className="mx-2 w-px h-6 bg-border" />
          
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom Out">
             <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-12 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom In">
             <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="mx-2 w-px h-6 bg-border" />

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
          >
            <Undo className="mr-2 h-4 w-4" /> Undo
          </Button>

          {onRotate && (
            <Button variant="ghost" size="sm" onClick={onRotate} title="Rotate Page">
                <RotateCw className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
             <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive" title="Delete Page">
                <Trash2 className="h-4 w-4" />
             </Button>
          )}

          <div className="flex-1" />
          
          <Button size="sm" onClick={handleSave} disabled={annotations.length === 0}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
        </div>

        {/* Editor Canvas Area */}
        <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-8 select-none">
            <div 
                ref={containerRef}
                className="relative shadow-lg ring-1 ring-border my-auto bg-white transition-all duration-200"
                style={{ 
                    // No explicit width/height here, canvas sets it
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {/* PDF Background */}
                <canvas ref={canvasRef} className="block" />
                
                {/* Annotation Overlay */}
                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                    {annotations.map((ann, i) => (
                        <React.Fragment key={i}>
                            {ann.type === 'rect' && (
                                <rect 
                                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`} 
                                    width={`${ann.width * 100}%`} height={`${ann.height * 100}%`} 
                                    fill={ann.color} stroke={ann.borderColor} strokeWidth="2"
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                            {ann.type === 'text' && (
                                <text 
                                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`} 
                                    dy="1em"
                                    fontSize="20" // Fixed font size in pixels? Or relative?
                                    // SVG text scaling is tricky with percentage coords if we want constant font size.
                                    // But here the SVG scales with Canvas. So font size 20 means 20px at zoom 1 (if w/h match).
                                    // Actually, if we use % for X/Y, the SVG ViewBox is usually the issue.
                                    // If we don't set viewBox, 1 unit = 1 pixel.
                                    // x="50%" works.
                                    fill={ann.color} fontWeight="bold"
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
                            fill="rgba(255,0,0,0.1)" stroke="red" strokeWidth="2" strokeDasharray="5,5"
                        />
                    )}
                </svg>
            </div>
        </div>
    </div>
  );
};

export default PDFPageEditor;
