import React, { useRef, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Type, Square, Save, X, Undo } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFEditorProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  onSave: (newFile: File) => void;
}

const PDFEditor = ({ isOpen, onClose, file, onSave }: PDFEditorProps) => {
  const [tool, setTool] = useState<'none' | 'text' | 'rect'>('none');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for annotations
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<any>(null); // Temporary rect being drawn
  
  // Render PDF to Canvas
  useEffect(() => {
    if (isOpen && file && canvasRef.current) {
      const renderPage = async () => {
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
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        } as any).promise;
      };
      renderPage();
    }
  }, [isOpen, file]);
  
  const getMousePos = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
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
          size: 20,
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
  
  // Rerender Canvas + Annotations (Naive approach: Clear and Redraw PDF + shapes per frame/change is slow)
  // Better approach: PDF Canvas is static background. Annotations are SVG overlay or second canvas.
  // Let's use SVG overlay for interactivity, it's easier for DOM events.
  
  // So we keep canvas render effect JUST for PDF.
  // And we render annotations in an absolute SVG layer on top.

  const handleSave = async () => {
    if (!file || annotations.length === 0) {
      onClose();
      return;
    }

    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0]; // We are editing single page files (from split) or first page
      
      const { width, height } = firstPage.getSize();
      
      // Calculate scale factor used in rendering
      // We used scale 1.5 in viewport
      // Canvas dimensions were set to viewport dimensions.
      // So canvasWidth = width * 1.5
      // To get PDF coord, we need to divide by 1.5
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
             y: height - (ann.y / scale), // Text anchor is usually bottom-left of text? or baseline. pdf-lib is baseline.
             size: ann.size, /* Font size doesn't scale with viewport automatically? */ 
             font: helveticaFont,
             color: rgb(1, 0, 0),
           });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const newFile = new File([pdfBytes as any], file.name, { type: 'application/pdf' });
      onSave(newFile);
      onClose();
    } catch (e) {
      console.error("Failed to save annotations", e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Page</DialogTitle>
          <DialogDescription>Add text or shapes to your PDF.</DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b pb-4">
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
            <Square className="mr-2 h-4 w-4" /> Rectangle
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            disabled={annotations.length === 0}
          >
            <Undo className="mr-2 h-4 w-4" /> Undo
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-auto bg-secondary/20 flex items-center justify-center p-4">
          <div 
            className="relative shadow-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
             {/* PDF Background */}
             <canvas ref={canvasRef} className="bg-white block" />
             
             {/* Annotation Overlay */}
             <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
               {annotations.map((ann, i) => {
                 if (ann.type === 'rect') {
                   return (
                     <rect 
                        key={i} 
                        x={ann.x} y={ann.y} width={ann.width} height={ann.height} 
                        fill={ann.color} stroke={ann.borderColor} strokeWidth="2"
                     />
                   );
                 }
                 if (ann.type === 'text') {
                   return (
                     <text 
                        key={i} 
                        x={ann.x} y={ann.y} 
                        fontSize={ann.size} fill={ann.color} fontWeight="bold"
                     >
                       {ann.text}
                     </text>
                   );
                 }
                 return null;
               })}
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
      </DialogContent>
    </Dialog>
  );
};

export default PDFEditor;
