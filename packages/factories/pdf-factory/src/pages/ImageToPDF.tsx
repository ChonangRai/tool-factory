import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Download, FileOutput, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { validateImageFiles, ValidatedImage } from '@/lib/imageValidation';
import { downloadBlob } from '@/lib/download';
import { pdfFile } from '@/lib/pdfBytes';
import { yieldToBrowser } from '@/lib/scheduling';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import ContinueWithPDF from '@/components/factory/ContinueWithPDF';
import { SortablePageCard } from '@/components/factory/SortablePageCard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

type PageMode = 'fitToA4' | 'fitToImage';

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const FIT_TO_IMAGE_DPI = 96;
const FIT_TO_IMAGE_MAX_POINTS = 3000;

interface ImageItem extends ValidatedImage {
  id: string;
  previewUrl: string;
}

const IMAGE_ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const ImageToPDF = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageMode, setPageMode] = useState<PageMode>('fitToA4');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [exported, setExported] = useState<File | null>(null);
  const imagesRef = useRef<ImageItem[]>([]);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpload = useCallback(async (files: File[]) => {
    const { valid, errors } = await validateImageFiles(files, imagesRef.current.length);

    if (valid.length > 0) {
      const newItems: ImageItem[] = valid.map((v) => ({
        ...v,
        id: `${v.file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        previewUrl: URL.createObjectURL(v.file),
      }));
      setImages((prev) => [...prev, ...newItems]);
      toast({ title: 'Images added', description: `${valid.length} image(s) added.` });
    }

    if (errors.length > 0) {
      toast({
        title: valid.length > 0 ? 'Some files were skipped' : 'Upload failed',
        description: errors.slice(0, 3).join(' '),
        variant: 'destructive',
      });
    }
  }, []);

  // Changing the images invalidates the PDF built from the previous set.
  useEffect(() => {
    setExported(null);
  }, [images, pageMode]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({
      title: 'Some files were skipped',
      description: `${fileNames.join(', ')}: not a JPEG or PNG image.`,
      variant: 'destructive',
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setImages((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const computePlacement = useCallback((imgWidth: number, imgHeight: number) => {
    if (pageMode === 'fitToImage') {
      let pageWidth = (imgWidth / FIT_TO_IMAGE_DPI) * 72;
      let pageHeight = (imgHeight / FIT_TO_IMAGE_DPI) * 72;
      const largest = Math.max(pageWidth, pageHeight);
      if (largest > FIT_TO_IMAGE_MAX_POINTS) {
        const scaleDown = FIT_TO_IMAGE_MAX_POINTS / largest;
        pageWidth *= scaleDown;
        pageHeight *= scaleDown;
      }
      return { pageWidth, pageHeight, x: 0, y: 0, drawWidth: pageWidth, drawHeight: pageHeight };
    }

    const isLandscape = imgWidth > imgHeight;
    const pageWidth = isLandscape ? A4_PORTRAIT[1] : A4_PORTRAIT[0];
    const pageHeight = isLandscape ? A4_PORTRAIT[0] : A4_PORTRAIT[1];
    const margin = 0.05;
    const maxW = pageWidth * (1 - margin * 2);
    const maxH = pageHeight * (1 - margin * 2);
    const scale = Math.min(maxW / imgWidth, maxH / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    return {
      pageWidth,
      pageHeight,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    };
  }, [pageMode]);

  const handleExport = useCallback(async () => {
    if (images.length === 0) return;

    setIsExporting(true);
    setProgress({ current: 0, total: images.length });
    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const bytes = await item.file.arrayBuffer();
        const embedded = item.kind === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const { pageWidth, pageHeight, x, y, drawWidth, drawHeight } = computePlacement(
          embedded.width,
          embedded.height
        );

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });

        setProgress({ current: i + 1, total: images.length });
        // Yield to the browser so the progress UI can repaint between images.
        await yieldToBrowser();
      }

      // One File for the download and for carrying on into another tool.
      const created = pdfFile(await pdfDoc.save(), `images-to-pdf-${Date.now()}.pdf`);
      downloadBlob(created, created.name);
      setExported(created);
      toast({ title: 'PDF created', description: `${images.length} image(s) combined into one PDF.` });
    } catch (error) {
      console.error('Failed to build PDF from images', error);
      toast({ title: 'Export failed', description: 'Something went wrong while creating the PDF.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [images, computePlacement]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="Image to PDF"
            description="Combine JPEG and PNG images into one PDF, in the order you choose."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={
              images.length > 0
                ? `${images.length} ${images.length === 1 ? 'image' : 'images'} · 1 page each`
                : undefined
            }
          />

          <UploadZone
            onUpload={handleUpload}
            onRejected={handleRejected}
            hasFiles={images.length > 0}
            accept={IMAGE_ACCEPT}
            formatLabels={['JPEG', 'PNG']}
            dropLabel="Drop your images here"
          >
            {({ open }) => (
              <div className="space-y-6">
                {/* Export settings */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <span id="page-size-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Page size
                      </span>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="page-size-label">
                        <Button
                          size="sm"
                          variant={pageMode === 'fitToA4' ? 'default' : 'outline'}
                          onClick={() => setPageMode('fitToA4')}
                          title="Place each image on a standard A4 page"
                          aria-pressed={pageMode === 'fitToA4'}
                        >
                          Fit image to A4
                        </Button>
                        <Button
                          size="sm"
                          variant={pageMode === 'fitToImage' ? 'default' : 'outline'}
                          onClick={() => setPageMode('fitToImage')}
                          title="Size each page to match its image"
                          aria-pressed={pageMode === 'fitToImage'}
                        >
                          Fit page to image
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {progress && (
                        <div className="flex w-40 items-center gap-2">
                          <Progress
                            value={(progress.current / progress.total) * 100}
                            aria-label="Export progress"
                          />
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {progress.current}/{progress.total}
                          </span>
                        </div>
                      )}
                      <Button variant="outline" onClick={open}>
                        Add more images
                      </Button>
                      <Button onClick={handleExport} disabled={isExporting || images.length === 0}>
                        {isExporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Create PDF
                      </Button>
                    </div>
                  </div>
                </div>

                {exported && (
                  <ContinueWithPDF file={exported} from="image-to-pdf" pageCount={images.length} />
                )}

                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Pages — drag to reorder
                </h2>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {images.map((item, index) => (
                        <SortablePageCard key={item.id} id={item.id}>
                          {({ isDragging, handleProps }) => (
                            <div className={`factory-card group relative aspect-[3/4] ${isDragging ? 'dragging' : ''}`}>
                              <div
                                {...handleProps}
                                className="absolute left-1 top-1 z-20 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 opacity-100 hover:bg-background/80 hover:text-foreground active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100"
                                aria-label="Drag to reorder"
                              >
                                <div className="grid grid-cols-2 gap-0.5">
                                  {Array.from({ length: 6 }).map((_, i) => (
                                    <span key={i} className="h-1 w-1 rounded-full bg-current" />
                                  ))}
                                </div>
                              </div>
                              <img
                                src={item.previewUrl}
                                alt={item.file.name}
                                className="h-full w-full bg-secondary object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemove(item.id)}
                                className="factory-icon-btn destructive focus-ring absolute right-2 top-2 bg-destructive/10 text-destructive opacity-100 hover:bg-destructive hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                title="Remove image"
                                aria-label={`Remove ${item.file.name}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
                                <span className="max-w-[120px] truncate font-medium text-foreground" title={item.file.name}>
                                  {item.file.name}
                                </span>
                                <span className="ml-2 shrink-0 text-muted-foreground">{index + 1}</span>
                              </div>
                            </div>
                          )}
                        </SortablePageCard>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </UploadZone>

          {images.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <FileOutput className="h-4 w-4 shrink-0" aria-hidden="true" />
                Each image becomes one page
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Built locally — nothing is uploaded
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ImageToPDF;
