import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Type, Square, Save, Undo, RotateCw, Trash2 } from 'lucide-react';
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
  
  // State for annotations
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<any>(null); // Temporary rect being drawn
  const [renderKey, setRenderKey] = useState(0); // Force re-render on file change

  // Reset annotations when file changes
  useEffect(() => {
    setAnnotations([]);
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
          
          const viewport = page.getViewport({ scale: 1.5 }); // Good quality for editing
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
  }, [file, renderKey]);
  
  const getMousePos = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    // Calculate scale ratio between displayed size and actual canvas size
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'none') return;
    setIsDrawing(true);
    const pos = getMousePos(e);
    setStartPos(pos);
    
    if (tool === 'text') {
      const text = prompt("Enter text:");
      if (text) {
        setAnnotations(prev => [...prev, {
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: text,
          size: 20 * 1.5, // Scale font size to match canvas scale
          color: 'red'
        }]);
      }
      setIsDrawing(false); // Text is instant placement for now
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || tool !== 'rect') return;
    const pos = getMousePos(e);
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
        color: 'rgba(255, 0, 0, 0.3)', // Semi-transparent red
        borderColor: 'red'
      }]);
      setCurrentRect(null);
    }
    setIsDrawing(false);
  };
  
  const handleSave = async () => {
    if (!file) return;

    // If no annotations, just save same file? Or warn?
    // Let's allow saving even if just for flow
    
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      
      const { width, height } = firstPage.getSize();
      
      // Canvas was rendered at scale 1.5
      // Canvas width = PDF width * 1.5
      // Mouse coordinates are in Canvas space
      // So we need to divide by 1.5 to get PDF space
      const scale = 1.5;

      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Apply annotations
      for (const ann of annotations) {
        if (ann.type === 'rect') {
           // PDF Lib uses Bottom-Left origin. Canvas uses Top-Left.
           // y_pdf = height - (y_canvas / scale) - (height_rect / scale)
           
           firstPage.drawRectangle({
             x: ann.x / scale,
             y: height - (ann.y / scale) - (ann.height / scale),
             width: ann.width / scale,
             height: ann.height / scale,
             borderColor: rgb(1, 0, 0),
             color: rgb(1, 0, 0),
             borderWidth: 2,
             opacity: 0.3,
           });
        }
        else if (ann.type === 'text') {
           firstPage.drawText(ann.text, {
             x: ann.x / scale,
             y: height - (ann.y / scale),
             size: ann.size / scale, 
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
        <div className="flex items-center gap-2 border-b bg-card p-2 shadow-sm z-10">
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
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
          >
            <Undo className="mr-2 h-4 w-4" /> Undo
          </Button>

          <div className="mx-2 w-px h-6 bg-border" />

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
        <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-8">
            <div 
                className="relative shadow-lg ring-1 ring-border my-auto"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {/* PDF Background */}
                <canvas ref={canvasRef} className="bg-white block max-w-full" />
                
                {/* Annotation Overlay */}
                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                    {annotations.map((ann, i) => (
                        <React.Fragment key={i}>
                            {ann.type === 'rect' && (
                                <rect 
                                    x={ann.x} y={ann.y} width={ann.width} height={ann.height} 
                                    fill={ann.color} stroke={ann.borderColor} strokeWidth="2"
                                />
                            )}
                            {ann.type === 'text' && (
                                <text 
                                    x={ann.x} y={ann.y} 
                                    fontSize={ann.size} fill={ann.color} fontWeight="bold"
                                >
                                    {ann.text}
                                </text>
                            )}
                        </React.Fragment>
                    ))}
                    {currentRect && (
                        <rect 
                            x={currentRect.x} y={currentRect.y} 
                            width={currentRect.width} height={currentRect.height} 
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
