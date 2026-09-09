import { useState, useCallback, useEffect } from 'react';
import { usePDF, PDFPageItem } from '@/hooks/usePDF';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { downloadBlob } from '@/lib/download';
import { claimActivePdf, type ActivePdfMeta } from '@/lib/activePdf';
import { pdfFileFrom } from '@/lib/pdfBytes';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import CarriedFrom from '@/components/factory/CarriedFrom';
import ResultActions from '@/components/factory/ResultActions';
import PageGrid from '@/components/factory/PageGrid';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Download, Loader2, MousePointerSquareDashed, Scissors } from 'lucide-react';
import PDFPageEditor from '@/components/factory/PDFPageEditor';
import SidebarList from '@/components/factory/SidebarList';

const Index = () => {
  const [pdfItems, setPdfItems] = useState<PDFPageItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<ActivePdfMeta | null>(null);
  const [exported, setExported] = useState<File | null>(null);
  const { mergePDFs, splitPDF, isProcessing } = usePDF();

  const handleUpload = useCallback(async (newFiles: File[]) => {
    setCarriedFrom(null);
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
        title: "PDFs added",
        description: `${valid.length} file(s) added to the workspace`,
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

  // Carried PDFs join the workspace through the ordinary upload path.
  useEffect(() => {
    const carried = claimActivePdf();
    if (!carried) return;
    void handleUpload([carried.file]).then(() => setCarriedFrom(carried.meta));
  }, [handleUpload]);

  // Any edit invalidates a previous export, so the next-step offer never
  // carries a file that no longer matches what is on screen.
  useEffect(() => {
    setExported(null);
  }, [pdfItems]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({
      title: "Some files were skipped",
      description: `${fileNames.join(', ')}: not a PDF file.`,
      variant: "destructive",
    });
  }, []);

  // Only the ids are read; the grid's own item shape is not this page's concern.
  const handleReorder = useCallback((newItems: { id: string }[]) => {
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
      const file = pdfFileFrom(blob, filename);
      downloadBlob(file, filename);
      setExported(file);
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
      title: "Pages extracted",
      description: "Every page is now a separate item you can reorder."
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

  const hasFiles = pdfItems.length > 0;
  const totalPages = pdfItems.reduce((sum, item) => sum + item.pageCount, 0);
  const exportLabel = pdfItems.length >= 2 ? 'Merge & export' : 'Export PDF';
  const selectedItem = pdfItems.find(i => i.id === selectedPageId) || null;

  const countSummary = `${pdfItems.length} ${pdfItems.length === 1 ? 'file' : 'files'} · ${totalPages} ${
    totalPages === 1 ? 'page' : 'pages'
  }`;

  const exportButton = (
    <button
      onClick={handleExport}
      disabled={isProcessing || !hasFiles}
      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
    >
      {isProcessing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {isProcessing ? 'Processing…' : exportLabel}
    </button>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 overflow-hidden">
        {viewMode === 'grid' ? (
          <div className="h-full overflow-y-auto">
            <div className="page-shell py-6 sm:py-8">
              <PageHeader
                title="PDF Workspace"
                description={
                  hasFiles
                    ? undefined
                    : 'Add PDFs to merge, split, reorder, rotate or annotate them — all in your browser.'
                }
                meta={
                  hasFiles ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{countSummary}</span>
                      {carriedFrom && <CarriedFrom meta={carriedFrom} />}
                    </span>
                  ) : undefined
                }
                actions={
                  hasFiles ? (
                    <>
                      <button
                        onClick={handleSplitMode}
                        disabled={isProcessing}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Scissors className="h-4 w-4" aria-hidden="true" />
                        )}
                        Split into pages
                      </button>
                      {exportButton}
                    </>
                  ) : undefined
                }
              />

              <div className="mt-6">
                <UploadZone onUpload={handleUpload} onRejected={handleRejected} hasFiles={hasFiles}>
                  {({ open }) => (
                    <>
                      <h2 className="sr-only">Files in this workspace</h2>
                      <PageGrid
                        pages={uiPages}
                        onReorder={handleReorder}
                        onRotate={handleRotate}
                        onRemove={handleRemove}
                        onEdit={handleEdit}
                        onAdd={open}
                      />

                      <p className="mt-6 flex items-center gap-2 border-t border-dashed border-border pt-4 text-sm text-muted-foreground">
                        <MousePointerSquareDashed className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Click a file to annotate its pages, drag the handle to reorder, or split it into
                        individual pages.
                      </p>
                    </>
                  )}
                </UploadZone>
              </div>

              {exported && (
                <div className="mt-6">
                  <ResultActions
                    file={exported}
                    from="workspace"
                    pageCount={totalPages}
                    onDownload={() => downloadBlob(exported, exported.name)}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Page-level editing view */
          <div className="flex h-full flex-col">
            {/* Document-level toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setViewMode('grid')}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Back to files</span>
                </button>
                <span className="hidden h-5 w-px bg-border sm:block" />
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-foreground">Editor</h1>
                  <p className="truncate text-xs text-muted-foreground">{countSummary}</p>
                </div>
              </div>

              {exportButton}
            </div>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              {/* Page list */}
              <div className="flex max-h-56 w-full flex-col border-b border-border bg-muted/10 sm:h-full sm:max-h-none sm:w-64 sm:border-b-0 sm:border-r">
                <h2 className="border-b border-border bg-background px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pages
                </h2>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                  <SidebarList
                    pages={uiPages}
                    selectedId={selectedPageId}
                    onSelect={setSelectedPageId}
                    onReorder={handleReorder}
                  />
                </div>
              </div>

              {/* Editor */}
              <div className="relative flex min-h-0 flex-1 flex-col bg-background">
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
                  <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 p-8 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                      <MousePointerSquareDashed className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">Select a page to edit</h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Choose a page from the list to annotate, rotate or delete it. Drag pages in the list to
                      change their order.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
