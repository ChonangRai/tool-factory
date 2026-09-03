import { useState, useCallback } from 'react';
import { usePDF, PDFPageItem } from '@/hooks/usePDF';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { downloadBlob } from '@/lib/download';
import Header from '@/components/factory/Header';
import UploadZone from '@/components/factory/UploadZone';
import PageGrid from '@/components/factory/PageGrid';
import EmptyState from '@/components/factory/EmptyState';
import { toast } from '@/hooks/use-toast';
import { Download, Loader2 } from 'lucide-react';
import PDFPageEditor from '@/components/factory/PDFPageEditor';
import SidebarList from '@/components/factory/SidebarList';

const Index = () => {
  const [pdfItems, setPdfItems] = useState<PDFPageItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const { mergePDFs, splitPDF, isProcessing } = usePDF();

  const handleUpload = useCallback(async (newFiles: File[]) => {
    const existingPageCount = pdfItems.reduce((sum, item) => sum + item.pageCount, 0);
    const { valid, errors } = await validatePDFFiles(newFiles, pdfItems.length, existingPageCount);

    if (valid.length > 0) {
      const newItems: PDFPageItem[] = valid.map(({ file, pageCount }) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        rotation: 0,
        pageCount,
      }));

      setPdfItems(prev => [...prev, ...newItems]);
      toast({
        title: "PDFs uploaded",
        description: `${valid.length} file(s) added to the factory`,
      });
    }

    if (errors.length > 0) {
      toast({
        title: valid.length > 0 ? "Some files were skipped" : "Upload failed",
        description: errors.slice(0, 3).join(' '),
        variant: "destructive",
      });
    }
  }, [pdfItems]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({
      title: "Some files were skipped",
      description: `${fileNames.join(', ')}: not a PDF file.`,
      variant: "destructive",
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
    // Open the annotator directly on this document -- no forced splitting.
    // PDFPageEditor handles navigation across all of the document's pages
    // itself, so a multi-page PDF stays a single item here.
    setSelectedPageId(id);
    setViewMode('split');
  }, []);

  const handleSaveEdit = useCallback((newFile: File, targetId?: string) => {
    const idToUpdate = targetId;
    if (!idToUpdate) return;

    setPdfItems(prev => prev.map(item => {
      if (item.id === idToUpdate) {
        // Rotation is a separate, pending transform applied at export time
        // (see mergePDFs) -- annotating a page must not silently discard it.
        return {
          ...item,
          file: newFile,
        };
      }
      return item;
    }));

    toast({
      title: "Changes saved",
      description: "Annotations saved to the PDF."
    });
  }, []);

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

    const blob = await mergePDFs(pdfItems);

    if (blob) {
      const filename = pdfItems.length === 1 ? pdfItems[0].file.name : `merged-${Date.now()}.pdf`;
      downloadBlob(blob, filename);
      toast({
        title: "Export complete",
        description: pdfItems.length === 1
          ? `${filename} is ready.`
          : `${pdfItems.length} files merged into ${filename}.`,
      });
    }
  }, [pdfItems, mergePDFs]);

  const handleExtractPages = useCallback(async () => {
    if (pdfItems.length === 0) return;

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
          rotation: 0,
          pageCount: 1
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

  const handleSplitMode = async () => {
    if (pdfItems.length === 0) return;

    // Auto-extract pages if we have any multi-page docs
    await handleExtractPages();

    setViewMode('split');
  };

  const exportLabel = pdfItems.length >= 2 ? 'Merge & Export' : 'Export PDF';
  const selectedItem = pdfItems.find(i => i.id === selectedPageId) || null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 overflow-hidden">
        {viewMode === 'grid' ? (
             /* Standard Grid Layout */
             <div className="h-full overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
                <UploadZone onUpload={handleUpload} onRejected={handleRejected} hasFiles={pdfItems.length > 0}>
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
                            <div className="flex flex-wrap justify-end items-center mt-8 pt-8 border-t border-dashed border-border gap-4">
                                <button
                                    onClick={handleSplitMode}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-foreground border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    {isProcessing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <div className="flex gap-0.5">
                                            <div className="h-3 w-2 border border-current rounded-[1px]" />
                                            <div className="h-3 w-2 border border-current rounded-[1px]" />
                                        </div>
                                    )}
                                    <span>{isProcessing ? 'Processing...' : 'Split & Rearrange'}</span>
                                </button>

                                {pdfItems.length >= 1 && (
                                    <button
                                    onClick={handleExport}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    <span>{isProcessing ? 'Processing...' : exportLabel}</span>
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
            <div className="flex h-full flex-col sm:flex-row">
                {/* Sidebar */}
                <div className="flex max-h-56 w-full flex-col border-b border-border bg-muted/10 sm:h-full sm:w-64 sm:max-h-none sm:border-b-0 sm:border-r">
                    <div className="p-4 border-b border-border bg-background">
                         <h3 className="font-medium text-sm">Pages</h3>
                         <p className="text-xs text-muted-foreground">{pdfItems.length} {pdfItems.length === 1 ? 'file' : 'files'}</p>
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
                        {pdfItems.length >= 1 && (
                            <button
                                onClick={handleExport}
                                disabled={isProcessing}
                                className="w-full justify-center flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {isProcessing ? 'Processing...' : exportLabel}
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
                <div className="flex-1 min-h-0 bg-background relative flex flex-col">
                    {selectedPageId ? (
                        <PDFPageEditor
                          file={selectedItem?.file || null}
                          onSave={(newFile) => handleSaveEdit(newFile, selectedPageId)}
                          // Rotate/delete act on the whole file, so only expose them
                          // here when the file is a single page -- for a multi-page
                          // document they'd otherwise silently apply to every page.
                          onRotate={selectedItem?.pageCount === 1 ? () => handleRotate(selectedPageId) : undefined}
                          onDelete={selectedItem?.pageCount === 1 ? () => {
                              handleRemove(selectedPageId);
                              setSelectedPageId(null);
                          } : undefined}
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
    </div>
  );
};

export default Index;
