import { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, ImageIcon, Loader2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsLib from '@/lib/pdfWorker';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { downloadBlob } from '@/lib/download';
import Header from '@/components/factory/Header';
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

  await page.render({ canvasContext: context, viewport } as any).promise;

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
          await page.render({ canvasContext: context, viewport } as any).promise;
          thumbs.push(canvas.toDataURL('image/png'));
        }
        canvas.width = 0;
        canvas.height = 0;
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
        await new Promise((resolve) => requestAnimationFrame(resolve));
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
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-lg font-medium text-foreground">PDF to Image</h1>
            <p className="text-sm text-muted-foreground">Upload a PDF and export pages as PNG or JPEG images.</p>
          </div>

          <UploadZone onUpload={handleUpload} onRejected={handleRejected} hasFiles={isLoadingDoc || !!file}>
            {() => (
              <>
                {isLoadingDoc && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p>Opening PDF…</p>
                  </div>
                )}

                {!isLoadingDoc && file && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-medium text-foreground">{file.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {numPages} page{numPages === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={handleReset}>
                        Choose a different PDF
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Format</span>
                        {(['png', 'jpeg'] as ImageFormat[]).map((f) => (
                          <Button
                            key={f}
                            size="sm"
                            variant={format === f ? 'default' : 'outline'}
                            onClick={() => setFormat(f)}
                          >
                            {f.toUpperCase()}
                          </Button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Quality</span>
                        {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((key) => (
                          <Button
                            key={key}
                            size="sm"
                            variant={quality === key ? 'default' : 'outline'}
                            onClick={() => setQuality(key)}
                            title={QUALITY_PRESETS[key].hint}
                          >
                            {QUALITY_PRESETS[key].label}
                          </Button>
                        ))}
                      </div>

                      <div className="ml-auto flex items-center gap-3">
                        {progress && (
                          <div className="flex w-40 items-center gap-2">
                            <Progress value={(progress.current / progress.total) * 100} />
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {progress.current}/{progress.total}
                            </span>
                          </div>
                        )}
                        <Button onClick={handleExportAll} disabled={isExporting}>
                          {isExporting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {numPages === 1 ? 'Download Image' : 'Download All'}
                        </Button>
                      </div>
                    </div>

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
                              onClick={() => handleExportPage(index + 1)}
                              className="factory-icon-btn"
                              title={`Download page ${index + 1}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </UploadZone>

          {!file && !isLoadingDoc && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              <span>Each page is exported as a separate image.</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PDFToImage;
