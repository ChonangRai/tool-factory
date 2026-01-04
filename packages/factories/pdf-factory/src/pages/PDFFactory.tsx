import { useState, useCallback } from 'react';
import { usePDF, PDFPageItem } from '@/hooks/usePDF';
import Header from '@/components/factory/Header';
import UploadZone from '@/components/factory/UploadZone';
import PageGrid from '@/components/factory/PageGrid';
import EmptyState from '@/components/factory/EmptyState';
import { toast } from '@/hooks/use-toast';
import { Download, Plus } from 'lucide-react';
import PDFEditor from '@/components/factory/PDFEditor';

const Index = () => {
  const [pdfItems, setPdfItems] = useState<PDFPageItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const { mergePDFs, splitPDF, isProcessing } = usePDF();

  const handleUpload = useCallback((newFiles: File[]) => {
    const newItems = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      rotation: 0,
    }));
    
    setPdfItems(prev => [...prev, ...newItems]);
    toast({
      title: "PDFs uploaded",
      description: `${newFiles.length} file(s) added to the factory`,
    });
  }, []);

  const handleReorder = useCallback((newItems: any[]) => {
    setPdfItems(prevItems => {
      // Create a map for O(1) lookup
      const itemMap = new Map(prevItems.map(item => [item.id, item]));
      
      // Reconstruct the ordered list using the IDs from newItems
      // Filter out any items that might not exist (though shouldn't happen)
      const reordered = newItems
        .map(uiItem => {
          const original = itemMap.get(uiItem.id);
          if (original) {
            // Preserve the latest rotation from UI if PageGrid modified it (though it calls onRotate separately)
            // PageGrid DOES return rotation, but we handle rotation via onRotate. 
            // So we just take the file and id from original, and maybe rotation?
            // Actually PageGrid implementation passes rotation state back in onReorder if it changed it? 
            // No, PageGrid only reorders. Rotation is separate event.
            return original;
          }
          return null;
        })
        .filter((item): item is PDFPageItem => item !== null);

      return reordered;
    });
  }, []);

  const handleEdit = useCallback((id: string) => {
    setEditingItemId(id);
  }, []);

  const handleSaveEdit = useCallback((newFile: File) => {
    if (!editingItemId) return;

    setPdfItems(prev => prev.map(item => {
      if (item.id === editingItemId) {
        return {
          ...item,
          file: newFile,
          rotation: 0 // Reset rotation as editor saves baked-in
        };
      }
      return item;
    }));
    
    setEditingItemId(null);
    toast({
      title: "Changes Saved",
      description: "PDF updated successfully."
    });
  }, [editingItemId]);

  const handleRotate = useCallback((id: string) => {
    setPdfItems(prev => prev.map(item => 
      item.id === id 
        ? { ...item, rotation: (item.rotation + 90) % 360 }
        : item
    ));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setPdfItems(prev => prev.filter(item => item.id !== id));
    toast({
      title: "File removed",
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (pdfItems.length === 0) return;

    toast({
      title: "Processing PDFs...",
      description: `Preparing ${pdfItems.length} files.`,
    });

    const blob = await mergePDFs(pdfItems);
    
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pdf-forge-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, [pdfItems, mergePDFs]);

  const handleExtractPages = useCallback(async () => {
    if (pdfItems.length === 0) return;
    
    toast({
      title: "Extracting pages...",
      description: "Breaking down files into individual pages."
    });

    const newItems: PDFPageItem[] = [];

    for (const item of pdfItems) {
      const blobs = await splitPDF(item.file);
      blobs.forEach((blob, index) => {
        // Create new File object for each page
        const newFile = new File([blob], `${item.file.name.replace('.pdf', '')}-page-${index + 1}.pdf`, {
          type: 'application/pdf'
        });
        
        newItems.push({
          id: `${newFile.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file: newFile,
          rotation: 0 // Reset rotation as per extracted page (or preserve if needed, but extraction likely resets it unless we bake it in)
          // Note: pdf-lib copyPages usually preserves rotation if we don't override it. 
          // But our item.rotation tracks *added* rotation. 
          // If we extract, we probably start fresh unless we want to "apply" the rotation during extraction?
          // For now, simple extraction.
        });
      });
    }

    setPdfItems(newItems);
    toast({
      title: "Pages Extracted",
      description: `You now have ${newItems.length} individual pages to edit.`
    });
  }, [pdfItems, splitPDF]);

  const handleReset = useCallback(() => {
    setPdfItems([]);
    toast({
      title: "Factory reset",
      description: "All files have been cleared",
    });
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (pdfItems.length === 0) return;
    
    toast({
      title: "Zipping files...",
      description: `Compressing ${pdfItems.length} pages.`
    });

    try {
      // Dynamic import to keep bundle size optimized if possible, or just standard import
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // If we have rotation applied in UI (item.rotation), we should apply it before zipping?
      // Currently mergePDFs applies it. 
      // If we download individually (ZIP), the files are the RAW files (unless we extracted them, which are also raw).
      // If the user rotated a page in the UI, that metadata is in `item.rotation`.
      // The `item.file` is the original (or extracted) file WITHOUT rotation applied.
      // To export WITH rotation, we need to process them.
      // We can use usePDF's mergePDFs logic but for single files? Or just re-process.
      
      // For V1 "Download ZIP", let's assume we want to preserve the edits (Rotation).
      // So we should probably process each item through pdf-lib to apply rotation if needed.
      // Or just zip raw files if rotation is 0. 

      // Let's reuse mergePDFs logic but returning array of blobs? 
      // Or simply: 
      // For each item:
      //   Load doc, rotate page, save.
      //   Add to zip.
      
      // Let's do a lightweight accumulation.
      const { PDFDocument, degrees } = await import('pdf-lib');
      
      for (const item of pdfItems) {
        let fileData = await item.file.arrayBuffer();
        
        if (item.rotation !== 0) {
           const pdf = await PDFDocument.load(fileData);
           const pages = pdf.getPages();
           pages.forEach(p => {
             const current = p.getRotation().angle;
             p.setRotation(degrees(current + item.rotation));
           });
           const modifiedBytes = await pdf.save();
           fileData = modifiedBytes.buffer as ArrayBuffer;
        }

        zip.file(item.file.name, fileData);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pdf-factory-files-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Files zipped and downloaded!",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to zip files",
        variant: "destructive",
      });
    }
  }, [pdfItems]);

  // Adapt Items to UI Pages for the Grid
  const uiPages = pdfItems.map((item, index) => ({
    id: item.id,
    pageNumber: index + 1,
    rotation: item.rotation,
    fileName: item.file.name,
    file: item.file // Pass actual file for preview generation
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Upload Zone & Grid Combined */}
        <section className="pb-24">
          <UploadZone onUpload={handleUpload} hasFiles={pdfItems.length > 0}>
            {({ open }) => (
              <>
                {pdfItems.length > 0 && (
                  <>
                    <div className="mb-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <h2 className="text-lg font-medium text-foreground">Assembly Line</h2>
                        <span className="text-sm text-muted-foreground border-l pl-4 border-border">
                          {pdfItems.length} {pdfItems.length === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                      
                      {/* Add More Button (Moved to Header) */}
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open();
                        }}
                        className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      >
                         <Plus className="h-4 w-4" />
                         Add more PDFs
                      </button>
                    </div>
                    
                    <PageGrid
                      pages={uiPages}
                      onReorder={() => {}} 
                      onRotate={handleRotate}
                      onRemove={handleRemove}
                      onEdit={handleEdit}
                    />

                    {/* Action Buttons (Moved to Bottom) */}
                    <div className="flex justify-end gap-3 pt-8 border-t border-dashed border-border mt-8">
                      <button
                        onClick={handleExtractPages}
                        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                       <div className="flex items-center gap-2">
                          <Plus className="h-4 w-4 rotate-45" /> {/* Makeshift Split Icon or use different icon */}
                          <span>Extract Pages</span>
                        </div>
                      </button>

                      {pdfItems.length > 0 && (
                        <button
                          onClick={handleDownloadZip}
                          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download ZIP</span>
                        </button>
                      )}

                      {pdfItems.length >= 2 && (
                        <button
                          onClick={handleExport}
                          className="factory-btn-primary"
                        >
                          <Download className="h-4 w-4" />
                          <span>Merge & Export</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </UploadZone>
        </section>
      </main>

      <PDFEditor 
        isOpen={!!editingItemId}
        onClose={() => setEditingItemId(null)}
        file={pdfItems.find(i => i.id === editingItemId)?.file || null}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default Index;
