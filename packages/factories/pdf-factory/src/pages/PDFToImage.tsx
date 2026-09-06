import { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, ImageIcon, Loader2, ShieldCheck } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsLib from '@/lib/pdfWorker';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { downloadBlob } from '@/lib/download';
import { yieldToBrowser } from '@/lib/scheduling';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

type ImageFormat = 'png' | 'jpeg';
type QualityKey = 'standard' | 'high' | 'maximum';

const QUALITY_PRESETS: Record<QualityKey, { scale: number; jpegQuality: number; label: string; hint: string }> = {
  standard: { scale: 1.5, jpegQuality: 0.85, label: 'Standard', hint: 'Fast, smaller files' },
  high: { scale: 2.5, jpegQuality: 0.92, label: 'High', hint: 'Recommended' },
  maximum: { scale: 4, jpegQuality: 0.97, label: 'Maximum', hint: 'Best quality, larger files' },
};

const baseName = (name: string) => name.replace(/\.pdf$/i, '');

const renderPageToBlob = async (
  pdf: PDFDocumentProxy,
  pageNumber: number,
  format: ImageFormat,
  quality: QualityKey
): Promise<Blob> => {
  const preset = QUALITY_PRESETS[quality];
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: preset.scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas not supported');

  // 'print' intent renders the same flattened page, but pdf.js only schedules
  // its continuations on requestAnimationFrame for 'display' -- and a
  // background tab stops firing that, which would park a multi-page export
  // mid-way. Thumbnails below stay on the default intent: they are on-screen
  // preview work that only runs while the tab is visible anyway.
  await page.render({ canvasContext: context, viewport, canvas, intent: 'print' }).promise;

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      mime,
      format === 'jpeg' ? preset.jpegQuality : undefined
    );
  });

  // Release the canvas buffer immediately; we don't keep export-resolution
  // canvases around, only the small preview thumbnails.
  canvas.width = 0;
  canvas.height = 0;

  return blob;
};

const PDFToImage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState<QualityKey>('high');
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  const handleUpload = useCallback(async (files: File[]) => {
    const selected = files[0];
    if (!selected) return;
    if (files.length > 1) {
      toast({ title: 'Only one PDF at a time', description: 'Using the first file you selected.' });
    }

    setIsLoadingDoc(true);
    try {
      const { valid, errors } = await validatePDFFiles([selected], 0, 0);
      if (errors.length > 0 || valid.length === 0) {
        toast({ title: 'Upload failed', description: errors[0] ?? 'Could not read this PDF.', variant: 'destructive' });
        return;
      }

      const { file: validFile } = valid[0];
      const buffer = await validFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      const thumbs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (context) {
          // Same 'print' intent as the export below: it previews exactly what
          // will be exported, and it keeps pdf.js off requestAnimationFrame,
          // which a backgrounded tab suspends. Without it, dropping a PDF here
          // and switching tabs leaves the page stuck on "Opening PDF...".
          await page.render({ canvasContext: context, viewport, canvas, intent: 'print' }).promise;
          thumbs.push(canvas.toDataURL('image/png'));
        }
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        await yieldToBrowser();
      }

      pdfRef.current = pdf;
      setFile(validFile);
      setNumPages(pdf.numPages);
      setThumbnails(thumbs);
    } catch (error) {
      console.error('Failed to open PDF for conversion', error);
      toast({ title: 'Unable to open PDF', description: 'This file could not be rendered.', variant: 'destructive' });
    } finally {
      setIsLoadingDoc(false);
    }
  }, []);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({ title: 'Not a PDF file', description: fileNames.join(', '), variant: 'destructive' });
  }, []);

  const handleReset = useCallback(() => {
    pdfRef.current = null;
    setFile(null);
    setNumPages(0);
    setThumbnails([]);
  }, []);

  const handleExportPage = useCallback(async (pageNumber: number) => {
    if (!pdfRef.current || !file) return;
    try {
      const blob = await renderPageToBlob(pdfRef.current, pageNumber, format, quality);
      downloadBlob(blob, `${baseName(file.name)}-page-${pageNumber}.${format === 'png' ? 'png' : 'jpg'}`);
    } catch (error) {
      console.error('Failed to export page', error);
      toast({ title: 'Export failed', description: `Could not render page ${pageNumber}.`, variant: 'destructive' });
    }
  }, [file, format, quality]);

  const handleExportAll = useCallback(async () => {
    if (!pdfRef.current || !file || numPages === 0) return;

    if (numPages === 1) {
      await handleExportPage(1);
      return;
    }

    setIsExporting(true);
    setProgress({ current: 0, total: numPages });
    try {
      const zip = new JSZip();
      const ext = format === 'png' ? 'png' : 'jpg';
      for (let i = 1; i <= numPages; i++) {
        const blob = await renderPageToBlob(pdfRef.current, i, format, quality);
        zip.file(`${baseName(file.name)}-page-${i}.${ext}`, blob);
        setProgress({ current: i, total: numPages });
        // Yield to the browser so the progress UI can repaint between pages.
        await yieldToBrowser();
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${baseName(file.name)}-images.zip`);
      toast({ title: 'Export complete', description: `${numPages} images downloaded as a ZIP.` });
    } catch (error) {
      console.error('Failed to export all pages', error);
      toast({ title: 'Export failed', description: 'Something went wrong while converting pages.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [file, format, quality, numPages, handleExportPage]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="PDF to Image"
            description="Export pages as PNG or JPEG images. Everything is rendered in your browser."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={file && !isLoadingDoc ? `${file.name} · ${numPages} ${numPages === 1 ? 'page' : 'pages'}` : undefined}
            actions={
              file && !isLoadingDoc ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Choose a different PDF
                </Button>
              ) : undefined
            }
          />

          <UploadZone onUpload={handleUpload} onRejected={handleRejected} hasFiles={isLoadingDoc || !!file}>
            {() => (
              <>
                {isLoadingDoc && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                    <p>Opening PDF…</p>
                  </div>
                )}

                {!isLoadingDoc && file && (
                  <div className="space-y-6">
                    {/* Export settings */}
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-wrap gap-6">
                          <div>
                            <span id="format-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Format
                            </span>
                            <div className="flex gap-2" role="group" aria-labelledby="format-label">
                              {(['png', 'jpeg'] as ImageFormat[]).map((f) => (
                                <Button
                                  key={f}
                                  size="sm"
                                  variant={format === f ? 'default' : 'outline'}
                                  onClick={() => setFormat(f)}
                                  aria-pressed={format === f}
                                >
                                  {f.toUpperCase()}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span id="quality-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Quality
                            </span>
                            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="quality-label">
                              {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((key) => (
                                <Button
                                  key={key}
                                  size="sm"
                                  variant={quality === key ? 'default' : 'outline'}
                                  onClick={() => setQuality(key)}
                                  title={QUALITY_PRESETS[key].hint}
                                  aria-pressed={quality === key}
                                >
                                  {QUALITY_PRESETS[key].label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
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
                          <Button onClick={handleExportAll} disabled={isExporting} className="w-full lg:w-auto">
                            {isExporting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            )}
                            {numPages === 1 ? 'Download image' : `Download all ${numPages} pages`}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Pages
                      </h2>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {thumbnails.map((thumb, index) => (
                          <div key={index} className="factory-card group relative aspect-[3/4]">
                            <img
                              src={thumb}
                              alt={`Page ${index + 1}`}
                              className="h-full w-full bg-secondary object-contain"
                            />
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-card/95 px-2 py-1.5 text-xs">
                              <span className="font-medium text-foreground">Page {index + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleExportPage(index + 1)}
                                className="factory-icon-btn focus-ring"
                                title={`Download page ${index + 1}`}
                                aria-label={`Download page ${index + 1} as ${format.toUpperCase()}`}
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </UploadZone>

          {!file && !isLoadingDoc && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                Each page becomes a separate image
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Rendered locally — nothing is uploaded
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PDFToImage;
