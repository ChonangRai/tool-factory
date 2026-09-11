import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CornerUpRight,
  Download,
  Layers,
  Loader2,
  MousePointerSquareDashed,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { downloadBlob } from '@/lib/download';
import { claimActivePdf, type ActivePdfMeta } from '@/lib/activePdf';
import { releaseAllRenderDocs, releaseRenderDoc } from '@/lib/pdfDocCache';
import { runSplit, type SplitPart } from '@/lib/splitPlan';
import {
  baseName,
  buildPdfFile,
  defaultGroupName,
  groupPages,
  newGroupId,
  newSourceId,
  pagesForSource,
  pruneGroups,
  type PageGroup,
  type WorkspacePage,
  type WorkspaceSource,
} from '@/lib/workspaceDoc';
import type { Annotation } from '@/lib/annotations';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import CarriedFrom from '@/components/factory/CarriedFrom';
import ResultActions from '@/components/factory/ResultActions';
import PageOrganizer from '@/components/factory/PageOrganizer';
import PageRail from '@/components/factory/PageRail';
import PDFPageEditor from '@/components/factory/PDFPageEditor';
import SplitDialog from '@/components/factory/SplitDialog';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const [sources, setSources] = useState<WorkspaceSource[]>([]);
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [groups, setGroups] = useState<PageGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'organize' | 'edit'>('organize');
  const [carriedFrom, setCarriedFrom] = useState<ActivePdfMeta | null>(null);
  const [exported, setExported] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitProgress, setSplitProgress] = useState<{ done: number; total: number } | null>(null);
  const [jumpTo, setJumpTo] = useState('');

  // Anchor for shift-click range selection.
  const selectionAnchor = useRef<number | null>(null);
  const organizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => releaseAllRenderDocs(), []);

  const handleUpload = useCallback(async (newFiles: File[]) => {
    setCarriedFrom(null);
    const { valid, errors } = await validatePDFFiles(newFiles, sources.length, pages.length);

    if (valid.length > 0) {
      const added: WorkspaceSource[] = valid.map(({ file, pageCount }) => ({
        id: newSourceId(),
        file,
        name: file.name,
        pageCount,
      }));

      setSources(prev => [...prev, ...added]);
      setPages(prev => [...prev, ...added.flatMap(pagesForSource)]);
      const total = added.reduce((sum, source) => sum + source.pageCount, 0);
      toast({
        title: valid.length === 1 ? 'PDF added' : 'PDFs added',
        description: `${total} ${total === 1 ? 'page' : 'pages'} added to the workspace.`,
      });
    }

    if (errors.length > 0) {
      toast({
        title: valid.length > 0 ? 'Some files were skipped' : 'Upload failed',
        description: errors.slice(0, 3).join(' '),
        variant: 'destructive',
      });
    }
  }, [sources.length, pages.length]);

  // Carried PDFs join the workspace through the ordinary upload path.
  useEffect(() => {
    const carried = claimActivePdf();
    if (!carried) return;
    void handleUpload([carried.file]).then(() => setCarriedFrom(carried.meta));
    // Claim-once: this must not re-run when the upload handler changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any edit invalidates a previous export, so the next-step offer never
  // carries a file that no longer matches what is on screen.
  useEffect(() => {
    setExported(null);
  }, [pages]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({
      title: 'Some files were skipped',
      description: `${fileNames.join(', ')}: not a PDF file.`,
      variant: 'destructive',
    });
  }, []);

  const documentName = sources.length === 1 ? sources[0].name : `merged-${Date.now()}.pdf`;
  const currentIndex = currentPageId ? pages.findIndex(page => page.id === currentPageId) : -1;
  const currentPage = currentIndex === -1 ? null : pages[currentIndex];
  const currentSource = currentPage ? sources.find(source => source.id === currentPage.sourceId) ?? null : null;

  /* ---------------------------------------------------------------- pages */

  const handleOpenPage = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    setViewMode('edit');
  }, []);

  const handleRotate = useCallback((pageId: string) => {
    setPages(prev =>
      prev.map(page => (page.id === pageId ? { ...page, rotation: (page.rotation + 90) % 360 } : page)),
    );
  }, []);

  const removePages = useCallback((ids: Set<string>) => {
    setPages(prev => {
      const next = prev.filter(page => !ids.has(page.id));
      setGroups(current => pruneGroups(current, next));
      return next;
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    setCurrentPageId(prev => (prev && ids.has(prev) ? null : prev));
  }, []);

  const handleRemove = useCallback(
    (pageId: string) => {
      removePages(new Set([pageId]));
    },
    [removePages],
  );

  const handleAnnotationsChange = useCallback(
    (annotations: Annotation[]) => {
      if (!currentPageId) return;
      setPages(prev => prev.map(page => (page.id === currentPageId ? { ...page, annotations } : page)));
    },
    [currentPageId],
  );

  /* ------------------------------------------------------------ selection */

  const handleToggleSelect = useCallback(
    (index: number, shiftKey: boolean) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        const anchor = selectionAnchor.current;

        if (shiftKey && anchor !== null) {
          const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
          for (let i = from; i <= to; i += 1) {
            const page = pages[i];
            if (page) next.add(page.id);
          }
          return next;
        }

        const id = pages[index]?.id;
        if (!id) return prev;
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectionAnchor.current = index;
        return next;
      });
    },
    [pages],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    selectionAnchor.current = null;
  }, []);

  const selectedPages = useMemo(
    () => pages.filter(page => selectedIds.has(page.id)),
    [pages, selectedIds],
  );

  /* --------------------------------------------------------------- groups */

  const handleGroup = useCallback(() => {
    if (selectedIds.size < 1) return;

    const positions = pages.reduce<number[]>((acc, page, index) => {
      if (selectedIds.has(page.id)) acc.push(index);
      return acc;
    }, []);

    const id = newGroupId();
    const { pages: next, moved } = groupPages(pages, selectedIds, id);

    setPages(next);
    setGroups(prev => [...prev, { id, name: defaultGroupName(positions), collapsed: false }]);
    clearSelection();

    toast({
      title: 'Pages grouped',
      description: moved
        ? `${positions.length} pages now sit together as one section. Grouping only organises the workspace — export still writes the pages in the order you see.`
        : `${positions.length} pages grouped. Collapse the group to fold this part of the document away.`,
    });
  }, [pages, selectedIds, clearSelection]);

  const handleToggleGroup = useCallback((groupId: string) => {
    setGroups(prev =>
      prev.map(group => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)),
    );
  }, []);

  const handleRenameGroup = useCallback((groupId: string, name: string) => {
    setGroups(prev => prev.map(group => (group.id === groupId ? { ...group, name } : group)));
  }, []);

  const handleUngroup = useCallback((groupId: string) => {
    // Order is untouched -- only the marker is removed.
    setPages(prev => prev.map(page => (page.groupId === groupId ? { ...page, groupId: null } : page)));
    setGroups(prev => prev.filter(group => group.id !== groupId));
  }, []);

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    setGroups(prev => prev.map(group => ({ ...group, collapsed })));
  }, []);

  /* ---------------------------------------------------------------- files */

  const handleClear = useCallback(() => {
    if (!window.confirm('Clear the workspace? Your pages and annotations will be discarded.')) return;
    releaseAllRenderDocs();
    setSources([]);
    setPages([]);
    setGroups([]);
    setCurrentPageId(null);
    setViewMode('organize');
    clearSelection();
  }, [clearSelection]);

  const handleRemoveSource = useCallback(
    (sourceId: string) => {
      releaseRenderDoc(sourceId);
      setSources(prev => prev.filter(source => source.id !== sourceId));
      setPages(prev => {
        const next = prev.filter(page => page.sourceId !== sourceId);
        setGroups(current => pruneGroups(current, next));
        return next;
      });
      setCurrentPageId(null);
    },
    [],
  );

  /* --------------------------------------------------------------- output */

  const withProcessing = useCallback(async <T,>(work: () => Promise<T>): Promise<T | null> => {
    setIsProcessing(true);
    try {
      return await work();
    } catch (error) {
      console.error('PDF operation failed', error);
      toast({
        title: 'Something went wrong',
        description: 'The document could not be written. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (pages.length === 0) return;

    const name = sources.length === 1 ? sources[0].name : `merged-${Date.now()}.pdf`;
    const file = await withProcessing(() => buildPdfFile(pages, sources, name));
    if (!file) return;

    downloadBlob(file, name);
    setExported(file);
    toast({
      title: 'Export complete',
      description: `${name} — ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.`,
    });
  }, [pages, sources, withProcessing]);

  const handleExtract = useCallback(async () => {
    if (selectedPages.length === 0) return;

    const name = `${baseName(documentName)}-extract.pdf`;
    const file = await withProcessing(() => buildPdfFile(selectedPages, sources, name));
    if (!file) return;

    downloadBlob(file, name);
    setExported(file);
    toast({
      title: 'Pages extracted',
      description: `${selectedPages.length} ${selectedPages.length === 1 ? 'page' : 'pages'} saved as ${name}.`,
    });
  }, [selectedPages, sources, documentName, withProcessing]);

  const handleSplit = useCallback(
    async (parts: SplitPart[]) => {
      const result = await withProcessing(() =>
        runSplit(parts, pages, sources, documentName, (done, total) => setSplitProgress({ done, total })),
      );
      setSplitProgress(null);
      if (!result) return;

      setSplitOpen(false);
      // A single output is a real PDF the user can carry onward; a ZIP is not.
      setExported(result.file);
      toast({
        title: 'Split complete',
        description:
          result.partCount === 1
            ? `${result.fileName} is ready.`
            : `${result.partCount} PDFs downloaded as ${result.fileName}.`,
      });
    },
    [pages, sources, documentName, withProcessing],
  );

  /* ----------------------------------------------------------- navigation */

  const handleJump = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const target = Number(jumpTo);
      if (!Number.isInteger(target) || target < 1 || target > pages.length) {
        toast({
          title: 'No such page',
          description: `Enter a page between 1 and ${pages.length}.`,
          variant: 'destructive',
        });
        return;
      }

      const page = pages[target - 1];
      // Jumping into a collapsed group has to open it, or there is nothing to
      // scroll to.
      if (page.groupId) {
        setGroups(prev =>
          prev.map(group => (group.id === page.groupId ? { ...group, collapsed: false } : group)),
        );
      }
      setCurrentPageId(page.id);
      setJumpTo('');

      requestAnimationFrame(() => {
        organizerRef.current
          ?.querySelector(`[data-page-id="${page.id}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    [jumpTo, pages],
  );

  const hasPages = pages.length > 0;
  const isMerge = sources.length > 1;
  const exportLabel = isMerge ? 'Merge & export' : 'Export PDF';
  const countSummary = isMerge
    ? `${sources.length} files · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
    : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`;

  const exportButton = (
    <button
      onClick={handleExport}
      disabled={isProcessing || !hasPages}
      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {isProcessing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {isProcessing ? 'Processing…' : exportLabel}
    </button>
  );

  const selectionBar = (
    <div className="sticky top-0 z-30 -mx-1 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
      <form onSubmit={handleJump} className="flex items-center gap-1.5">
        <label htmlFor="jump-to-page" className="text-xs font-medium text-muted-foreground">
          Go to
        </label>
        <input
          id="jump-to-page"
          value={jumpTo}
          onChange={event => setJumpTo(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder={`1–${pages.length}`}
          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums shadow-sm focus:outline-none"
        />
      </form>

      {groups.length > 0 && (
        <>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <button
            type="button"
            onClick={() => setAllCollapsed(true)}
            className="focus-ring rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Collapse all
          </button>
          <button
            type="button"
            onClick={() => setAllCollapsed(false)}
            className="focus-ring rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Expand all
          </button>
        </>
      )}

      <span className="hidden h-5 w-px bg-border sm:block" />
      <button
        type="button"
        onClick={() => setSelectedIds(new Set(pages.map(page => page.id)))}
        className="focus-ring rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        Select all
      </button>

      <div className="flex-1" />

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-foreground">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleGroup}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Group pages
          </button>
          <button
            type="button"
            onClick={handleExtract}
            disabled={isProcessing}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
            title="Save the selected pages as one new PDF"
          >
            <CornerUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            Extract
          </button>
          <button
            type="button"
            onClick={() => selectedIds.forEach(handleRotate)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Rotate
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete ${selectedIds.size} page(s)? This cannot be undone.`)) {
                removePages(selectedIds);
              }
            }}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="focus-ring rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          Tick pages to extract, group, rotate or delete them. Shift-click for a range.
        </span>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 overflow-hidden">
        {viewMode === 'organize' ? (
          <div className="h-full overflow-y-auto">
            <div className="page-shell py-6 sm:py-8">
              <PageHeader
                title="PDF Workspace"
                description={
                  hasPages
                    ? undefined
                    : 'Add PDFs to organise, split, reorder, rotate or annotate their pages — all in your browser.'
                }
                meta={
                  hasPages ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{countSummary}</span>
                      {carriedFrom && <CarriedFrom meta={carriedFrom} />}
                    </span>
                  ) : undefined
                }
                actions={
                  hasPages ? (
                    <>
                      <button
                        onClick={handleClear}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setSplitOpen(true)}
                        disabled={isProcessing}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
                        title="Cut this document into several separate PDFs"
                      >
                        <Scissors className="h-4 w-4" aria-hidden="true" />
                        Split…
                      </button>
                      {exportButton}
                    </>
                  ) : undefined
                }
              />

              <div className="mt-6">
                <UploadZone onUpload={handleUpload} onRejected={handleRejected} hasFiles={hasPages}>
                  {({ open }) => (
                    <div ref={organizerRef}>
                      <h2 className="sr-only">Pages in this document</h2>
                      {selectionBar}
                      <PageOrganizer
                        pages={pages}
                        groups={groups}
                        sources={sources}
                        selectedIds={selectedIds}
                        currentPageId={currentPageId}
                        onPagesChange={setPages}
                        onOpenPage={handleOpenPage}
                        onToggleSelect={handleToggleSelect}
                        onRotate={handleRotate}
                        onRemove={handleRemove}
                        onToggleGroup={handleToggleGroup}
                        onRenameGroup={handleRenameGroup}
                        onUngroup={handleUngroup}
                        onAdd={open}
                      />

                      {isMerge && (
                        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-4 text-sm">
                          <span className="text-muted-foreground">Source files:</span>
                          {sources.map(source => (
                            <span
                              key={source.id}
                              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                            >
                              {source.name}
                              <button
                                type="button"
                                onClick={() => handleRemoveSource(source.id)}
                                className="focus-ring rounded-full text-muted-foreground hover:text-destructive"
                                aria-label={`Remove every page from ${source.name}`}
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="mt-6 flex items-center gap-2 border-t border-dashed border-border pt-4 text-sm text-muted-foreground">
                        <MousePointerSquareDashed className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Click a page to annotate it, drag the handle to reorder, or tick pages to group,
                        extract or delete them.
                      </p>
                    </div>
                  )}
                </UploadZone>
              </div>

              {exported && (
                <div className="mt-6">
                  <ResultActions
                    file={exported}
                    from="workspace"
                    pageCount={pages.length}
                    onDownload={() => downloadBlob(exported, exported.name)}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setViewMode('organize')}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">All pages</span>
                </button>
                <span className="hidden h-5 w-px bg-border sm:block" />
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-foreground">
                    {currentIndex === -1 ? 'Editor' : `Page ${currentIndex + 1}`}
                  </h1>
                  <p className="truncate text-xs text-muted-foreground">{countSummary}</p>
                </div>
              </div>

              {exportButton}
            </div>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <div className="flex max-h-56 w-full flex-col border-b border-border bg-muted/10 sm:h-full sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
                <h2 className="border-b border-border bg-background px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pages
                </h2>
                <div className="flex-1 overflow-y-auto p-3">
                  <PageRail
                    pages={pages}
                    groups={groups}
                    sources={sources}
                    currentPageId={currentPageId}
                    onSelect={setCurrentPageId}
                    onToggleGroup={handleToggleGroup}
                  />
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col bg-background">
                {currentPage && currentSource ? (
                  <PDFPageEditor
                    file={currentSource.file}
                    sourceId={currentSource.id}
                    sourceIndex={currentPage.sourceIndex}
                    annotations={currentPage.annotations}
                    onAnnotationsChange={handleAnnotationsChange}
                    onRotate={() => handleRotate(currentPage.id)}
                    onDelete={() => handleRemove(currentPage.id)}
                    onPrevPage={
                      currentIndex > 0 ? () => setCurrentPageId(pages[currentIndex - 1].id) : undefined
                    }
                    onNextPage={
                      currentIndex < pages.length - 1
                        ? () => setCurrentPageId(pages[currentIndex + 1].id)
                        : undefined
                    }
                    positionLabel={`Page ${currentIndex + 1} of ${pages.length}`}
                    className="h-full"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center bg-muted/10 p-8 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                      <MousePointerSquareDashed className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">Select a page to edit</h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Choose a page from the rail to annotate, rotate or delete it. Reordering and grouping
                      live in the page organiser.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <SplitDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        pages={pages}
        groups={groups}
        isSplitting={isProcessing}
        progress={splitProgress}
        onSplit={handleSplit}
      />
    </div>
  );
};

export default Index;
