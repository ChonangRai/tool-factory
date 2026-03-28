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

const COLORS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Black', value: '#000000' },
  { label: 'White', value: '#ffffff' }
];

const BORDER_SIZES = [0, 1, 2, 4, 8];

const hexToRgbTuple = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
};

const PDFPageEditor = ({ file, onSave, onRotate, onDelete, className = '' }: PDFPageEditorProps) => {
  const [tool, setTool] = useState<'none' | 'text' | 'rect'>('none');
  const [color, setColor] = useState(COLORS[0].value);
  const [borderSize, setBorderSize] = useState(2);
  
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
          
          const viewport = page.getViewport({ scale: 1.5 * zoom });
          const canvas = canvasRef.current;
          if (!canvas) return;
          
          const context = canvas.getContext('2d');
          if (!context) return;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
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
          color: color
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
        color: `${color}40`, // 25% opacity for fill
        borderColor: borderSize > 0 ? color : 'transparent',
        borderWidth: borderSize,
        hexColor: color
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

      for (const ann of annotations) {
        const pdfX = ann.x * width;
        const pdfY_Top = ann.y * height; 
        
        if (ann.type === 'rect') {
           const w = ann.width * width;
           const h = ann.height * height;
           
           const [r, g, b] = hexToRgbTuple(ann.hexColor || '#ff0000');
           firstPage.drawRectangle({
             x: pdfX,
             y: height - pdfY_Top - h,
             width: w,
             height: h,
             borderColor: ann.borderWidth > 0 ? rgb(r, g, b) : undefined,
             color: rgb(r, g, b),
             borderWidth: ann.borderWidth * 0.5, // Scale down border for PDF visually
             opacity: 0.25,
           });
        }
        else if (ann.type === 'text') {
           const fontSize = 20; 
           const [r, g, b] = hexToRgbTuple(ann.color || '#ff0000');
           
           firstPage.drawText(ann.text, {
             x: pdfX,
             y: height - pdfY_Top - (fontSize * 0.8), // Adjust baseline visually
             size: fontSize, 
             font: helveticaFont,
             color: rgb(r, g, b),
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
        <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2 shadow-sm z-10 sticky top-0">
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
          
          <div className="mx-2 w-px h-6 bg-border hidden sm:block" />
          
          {/* Customization Controls */}
          <div className="flex items-center gap-2">
             <div className="flex gap-1 bg-muted p-1 rounded-md">
                 {COLORS.map(c => (
                     <button
                        key={c.value}
                        onClick={() => setColor(c.value)}
                        className={`w-5 h-5 rounded-full border border-border shadow-sm transition-transform hover:scale-110 ${color === c.value ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                     />
                 ))}
             </div>
             
             <select 
                value={borderSize} 
                onChange={(e) => setBorderSize(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm hidden sm:block"
             >
                <option value={0}>No Border</option>
                <option value={1}>1px Border</option>
                <option value={2}>2px Border</option>
                <option value={4}>4px Border</option>
                <option value={8}>8px Border</option>
             </select>
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
            <Button variant="ghost" size="sm" onClick={onRotate} title="Rotate Page">
                <RotateCw className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
             <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive hidden sm:flex" title="Delete Page">
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
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                <canvas ref={canvasRef} className="block" />
                
                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                    {annotations.map((ann, i) => (
                        <React.Fragment key={i}>
                            {ann.type === 'rect' && (
                                <rect 
                                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`} 
                                    width={`${ann.width * 100}%`} height={`${ann.height * 100}%`} 
                                    fill={ann.color} stroke={ann.borderColor} strokeWidth={ann.borderWidth}
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                            {ann.type === 'text' && (
                                <text 
                                    x={`${ann.x * 100}%`} y={`${ann.y * 100}%`} 
                                    dy="1em"
                                    fontSize="20" 
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
                            fill={`${color}20`} stroke={borderSize > 0 ? color : 'transparent'} strokeWidth={borderSize > 0 ? borderSize : 2} strokeDasharray={borderSize === 0 ? "5,5" : undefined}
                        />
                    )}
                </svg>
            </div>
        </div>
    </div>
  );
};

export default PDFPageEditor;
