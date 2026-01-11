import { useState, useCallback } from 'react';
import { usePDF, PDFPageItem } from '@/hooks/usePDF';
import Header from '@/components/factory/Header';
import UploadZone from '@/components/factory/UploadZone';
import PageGrid from '@/components/factory/PageGrid';
import PageCard from '@/components/factory/PageCard';
import EmptyState from '@/components/factory/EmptyState';
import { toast } from '@/hooks/use-toast';
import { Download } from 'lucide-react';
import PDFEditor from '@/components/factory/PDFEditor';
import PDFPageEditor from '@/components/factory/PDFPageEditor';
import SidebarList from '@/components/factory/SidebarList';

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
      
      const reordered = newItems
        .map(uiItem => {
          const original = itemMap.get(uiItem.id);
          if (original) {
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
      link.download = `pdf-factory-${Date.now()}.pdf`;
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
        const newFile = new File([blob], `${item.file.name.replace('.pdf', '')}-page-${index + 1}.pdf`, {
          type: 'application/pdf'
        });
        
        newItems.push({
          id: `${newFile.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file: newFile,
          rotation: 0
        });
      });
    }

    setPdfItems(newItems);
    toast({
      title: "Pages Extracted",
      description: "All pages have been separated."
    });
  }, [pdfItems, splitPDF]);

  // Adapt Items to UI Pages for the Grid
  const uiPages = pdfItems.map((item, index) => ({
    id: item.id,
    pageNumber: index + 1,
    rotation: item.rotation,
    file: item.file
  }));

  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const handleSplitMode = async () => {
    if (pdfItems.length === 0) return;
    
    // Auto-extract pages if we have any multi-page docs
    await handleExtractPages();
    
    setViewMode('split');
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 overflow-hidden">
        {viewMode === 'grid' ? (
             /* Standard Grid Layout */
             <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
                <UploadZone onUpload={handleUpload} hasFiles={pdfItems.length > 0}>
                    {({ open }) => (
                    <>
                        {pdfItems.length > 0 ? (
                        <div className="mx-auto max-w-7xl">
                            <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-medium text-foreground">Assembly Line</h2>
                                <span className="text-sm text-muted-foreground border-l pl-4 border-border">
                                {pdfItems.length} {pdfItems.length === 1 ? 'file' : 'files'}
                                </span>
                            </div>
                            </div>
                            
                            <PageGrid 
                            pages={uiPages} 
                            onReorder={handleReorder}
                            onRotate={handleRotate}
                            onRemove={handleRemove}
                            onEdit={handleEdit}
                            onAdd={open}
                            />

                            {/* Action Buttons */}
                            <div className="flex justify-end items-center mt-8 pt-8 border-t border-dashed border-border gap-4">
                                <button
                                    onClick={handleSplitMode}
                                    className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-foreground border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    <div className="flex gap-0.5">
                                        <div className="h-3 w-2 border border-current rounded-[1px]" />
                                        <div className="h-3 w-2 border border-current rounded-[1px]" />
                                    </div>
                                    <span>Split & Rearrange</span>
                                </button>

                                {pdfItems.length >= 2 && (
                                    <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                                    >
                                    <Download className="h-4 w-4" />
                                    <span>Merge & Export</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        ) : (
                        <EmptyState />
                        )}
                    </>
                    )}
                </UploadZone>
             </div>
        ) : (
            /* Split & Rearrange View */
            <div className="flex h-full">
                {/* Sidebar */}
                <div className="w-64 border-r border-border bg-muted/10 flex flex-col">
                    <div className="p-4 border-b border-border bg-background">
                         <h3 className="font-medium text-sm">Pages</h3>
                         <p className="text-xs text-muted-foreground">{pdfItems.length} pages</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <SidebarList 
                            pages={uiPages}
                            selectedId={selectedPageId}
                            onSelect={setSelectedPageId}
                            onReorder={handleReorder}
                        />
                    </div>
                    <div className="p-4 border-t border-border bg-background space-y-2">
                        {pdfItems.length >= 2 && (
                            <button
                                onClick={handleExport}
                                className="w-full justify-center flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-sm"
                            >
                                <Download className="h-4 w-4" />
                                Merge & Export
                            </button>
                        )}
                        <button
                           onClick={() => setViewMode('grid')}
                           className="w-full justify-center flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                        >
                            Back to Grid
                        </button>
                    </div>
                </div>
                
                {/* Main Editor */}
                <div className="flex-1 bg-background relative flex flex-col">
                    {selectedPageId ? (
                        <PDFPageEditor 
                          file={pdfItems.find(i => i.id === selectedPageId)?.file || null}
                          onSave={handleSaveEdit}
                          onRotate={() => handleRotate(selectedPageId)}
                          onDelete={() => {
                              handleRemove(selectedPageId);
                              setSelectedPageId(null);
                          }}
                          className="h-full"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
                            <div className="h-16 w-16 mb-4 rounded-2xl bg-muted flex items-center justify-center">
                                <div className="flex gap-1">
                                    <div className="h-6 w-4 border-2 border-current rounded-sm" />
                                    <div className="h-6 w-4 border-2 border-dashed border-current rounded-sm" />
                                </div>
                            </div>
                            <h3 className="font-medium text-lg text-foreground">Select a page</h3>
                            <p>Click a page from the sidebar to edit, rotate, or delete it.</p>
                        </div>
                    )}
                </div>
            </div>
        )}
      </main>

      {/* Legacy Modal (kept for Grid View editing) */}
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
