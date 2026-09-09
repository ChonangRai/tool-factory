import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, FileText, Loader2, Minimize2, ShieldCheck } from 'lucide-react';
import pdfjsLib from '@/lib/pdfWorker';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { analyzePDF, type DocumentAnalysis } from '@/lib/pdfAnalysis';
import {
  compressScannedPages,
  formatFileSize,
  optimizeStructure,
  SCAN_PRESETS,
  type CompressionResult,
  type ScanPresetKey,
} from '@/lib/compress';
import { downloadBlob } from '@/lib/download';
import { claimActivePdf, type ActivePdfMeta } from '@/lib/activePdf';
import { pdfFileFrom } from '@/lib/pdfBytes';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import CarriedFrom from '@/components/factory/CarriedFrom';
import ResultActions from '@/components/factory/ResultActions';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

const baseName = (name: string) => name.replace(/\.pdf$/i, '');

/** Small, throwaway thumbnail used only for the before/after strip. */
const renderThumbnail = async (data: ArrayBuffer, pageNumber: number): Promise<string | null> => {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
    const viewport = page.getViewport({ scale: 0.45 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    // Same reason as in lib/compress: 'print' intent avoids the
    // requestAnimationFrame scheduling that a background tab freezes.
    await page.render({ canvasContext: context, viewport, canvas, intent: 'print' }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.8);
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    return url;
  } finally {
    await pdf.destroy();
  }
};

const CompressPDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [preset, setPreset] = useState<ScanPresetKey>('balanced');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [preview, setPreview] = useState<{ before: string; after: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<ActivePdfMeta | null>(null);
  const originalBytesRef = useRef<ArrayBuffer | null>(null);

  const reset = useCallback(() => {
    originalBytesRef.current = null;
    setFile(null);
    setAnalysis(null);
    setResult(null);
    setPreview(null);
    setProgress(null);
    setCarriedFrom(null);
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const selected = files[0];
    if (!selected) return;
    if (files.length > 1) {
      toast({ title: 'Only one PDF at a time', description: 'Using the first file you selected.' });
    }

    setIsAnalyzing(true);
    setResult(null);
    setPreview(null);
    setCarriedFrom(null);
    try {
      const { valid, errors } = await validatePDFFiles([selected], 0, 0);
      if (errors.length > 0 || valid.length === 0) {
        toast({ title: 'Upload failed', description: errors[0] ?? 'Could not read this PDF.', variant: 'destructive' });
        reset();
        return;
      }

      const validFile = valid[0].file;
      const inspected = await analyzePDF(validFile);
      originalBytesRef.current = await validFile.arrayBuffer();
      setFile(validFile);
      setAnalysis(inspected);
    } catch (error) {
      console.error('Failed to analyse PDF', error);
      toast({ title: 'Unable to open PDF', description: 'This file could not be read.', variant: 'destructive' });
      reset();
    } finally {
      setIsAnalyzing(false);
    }
  }, [reset]);

  // A PDF handed over by another tool goes through exactly the same upload
  // path as a file the user picks, so it gets the same validation and limits.
  useEffect(() => {
    const carried = claimActivePdf();
    if (!carried) return;
    void handleUpload([carried.file]).then(() => setCarriedFrom(carried.meta));
  }, [handleUpload]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({ title: 'Not a PDF file', description: fileNames.join(', '), variant: 'destructive' });
  }, []);

  const runCompression = useCallback(async (mode: 'structure' | 'scans') => {
    if (!file || !analysis) return;

    setIsWorking(true);
    setResult(null);
    setPreview(null);
    setProgress(mode === 'scans' ? { current: 0, total: analysis.pageCount } : null);

    try {
      const outcome =
        mode === 'structure'
          ? await optimizeStructure(file)
          : await compressScannedPages(file, analysis, preset, setProgress);

      setResult(outcome);

      if (mode === 'scans' && !outcome.keptOriginal && outcome.rasterizedPages.length > 0 && originalBytesRef.current) {
        const pageNumber = outcome.rasterizedPages[0];
        const [before, after] = await Promise.all([
          renderThumbnail(originalBytesRef.current.slice(0), pageNumber),
          renderThumbnail(await outcome.blob.arrayBuffer(), pageNumber),
        ]);
        if (before && after) setPreview({ before, after });
      }

      if (outcome.keptOriginal) {
        toast({
          title: 'Already as small as it gets',
          description: 'Compressing made no difference, so your original file was kept.',
        });
      }
    } catch (error) {
      console.error('Compression failed', error);
      toast({ title: 'Compression failed', description: 'This PDF could not be compressed.', variant: 'destructive' });
    } finally {
      setIsWorking(false);
      setProgress(null);
    }
  }, [analysis, file, preset]);

  // One File for both the download and the handoff: no second copy of a
  // result that can be 50MB.
  const resultFile = useMemo(
    () => (result && file ? pdfFileFrom(result.blob, `${baseName(file.name)}-compressed.pdf`) : null),
    [file, result],
  );

  const handleDownload = useCallback(() => {
    if (!resultFile) return;
    downloadBlob(resultFile, resultFile.name);
  }, [resultFile]);

  const unsupported = analysis?.unsupported ?? null;
  const scanPageCount = analysis?.scanLikePageNumbers.length ?? 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="Compress PDF"
            description="Make a PDF smaller without sending it anywhere. Everything runs in your browser."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={
              file && analysis && !isAnalyzing
                ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span>
                        {file.name} · {analysis.pageCount} {analysis.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                        {formatFileSize(analysis.originalBytes)}
                      </span>
                      {carriedFrom && <CarriedFrom meta={carriedFrom} />}
                    </span>
                  )
                : undefined
            }
            actions={
              file && !isAnalyzing ? (
                <Button variant="outline" size="sm" onClick={reset}>
                  Choose a different PDF
                </Button>
              ) : undefined
            }
          />

          <UploadZone
            onUpload={handleUpload}
            onRejected={handleRejected}
            hasFiles={isAnalyzing || !!file}
            dropLabel="Drop a PDF to compress"
          >
            {() => (
              <>
                {isAnalyzing && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                    <p>Checking your PDF…</p>
                  </div>
                )}

                {!isAnalyzing && file && analysis && (
                  <div className="space-y-6">
                    {unsupported ? (
                      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                        <div className="space-y-1">
                          <h2 className="text-sm font-semibold text-foreground">This PDF can&apos;t be compressed</h2>
                          <p className="text-sm text-muted-foreground">{unsupported.message}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {/* Lossless option */}
                        <section className="flex flex-col rounded-xl border border-border bg-card p-5">
                          <h2 className="text-base font-semibold text-foreground">Optimise structure</h2>
                          <p className="mt-1 flex-1 text-sm text-muted-foreground">
                            Tidies up how the file is stored. Nothing about the pages changes — text stays
                            selectable and sharp. Savings are usually modest, and some files are already
                            optimised.
                          </p>
                          <Button
                            className="mt-4 w-full sm:w-auto"
                            onClick={() => runCompression('structure')}
                            disabled={isWorking}
                          >
                            {isWorking && !progress ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Minimize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            )}
                            Optimise structure
                          </Button>
                        </section>

                        {/* Raster option */}
                        <section className="flex flex-col rounded-xl border border-border bg-card p-5">
                          <h2 className="text-base font-semibold text-foreground">Compress scanned pages</h2>
                          {scanPageCount > 0 ? (
                            <>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {scanPageCount} {scanPageCount === 1 ? 'page looks' : 'pages look'} like
                                {scanPageCount === 1 ? ' a scan' : ' scans'}. Those pages are re-saved as
                                images at a lower resolution, which can shrink them a lot. Any text that was
                                already part of the scan stays part of the picture, and quality may drop
                                slightly. Pages with real text are left exactly as they are.
                              </p>

                              <div className="mt-4">
                                <span id="preset-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Amount
                                </span>
                                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="preset-label">
                                  {(Object.keys(SCAN_PRESETS) as ScanPresetKey[]).map((key) => (
                                    <Button
                                      key={key}
                                      size="sm"
                                      variant={preset === key ? 'default' : 'outline'}
                                      onClick={() => setPreset(key)}
                                      title={SCAN_PRESETS[key].hint}
                                      aria-pressed={preset === key}
                                    >
                                      {SCAN_PRESETS[key].label}
                                    </Button>
                                  ))}
                                </div>
                              </div>

                              <Button
                                className="mt-4 w-full sm:w-auto"
                                onClick={() => runCompression('scans')}
                                disabled={isWorking}
                              >
                                {isWorking && progress ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Minimize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                )}
                                Compress scanned pages
                              </Button>
                            </>
                          ) : (
                            <p className="mt-1 flex-1 text-sm text-muted-foreground">
                              This PDF is made of text and graphics rather than scans. Re-saving those pages
                              as images would make the file bigger and blurrier, so it isn&apos;t offered
                              here — use <span className="font-medium text-foreground">Optimise structure</span> instead.
                            </p>
                          )}
                        </section>
                      </div>
                    )}

                    {progress && (
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                        <Progress
                          value={progress.total ? (progress.current / progress.total) * 100 : 0}
                          aria-label="Compression progress"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          Page {progress.current} of {progress.total}
                        </span>
                      </div>
                    )}

                    {result && (
                      <section className="rounded-xl border border-border bg-card p-5" aria-live="polite">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                                result.keptOriginal ? 'bg-secondary' : 'bg-primary/10'
                              }`}
                            >
                              {result.keptOriginal ? (
                                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                              ) : (
                                <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                              )}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                <span>{formatFileSize(result.originalBytes)}</span>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                <span>{formatFileSize(result.resultBytes)}</span>
                                {!result.keptOriginal && (
                                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                    {result.savedPercent.toFixed(1)}% smaller
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {result.keptOriginal
                                  ? 'This PDF was already about as small as it can get, so your original file was kept.'
                                  : `${formatFileSize(result.savedBytes)} saved · ${result.pageCount} ${
                                      result.pageCount === 1 ? 'page' : 'pages'
                                    } kept`}
                              </p>
                            </div>
                          </div>

                          {resultFile && (
                            <ResultActions
                              file={resultFile}
                              from="compress"
                              pageCount={result.pageCount}
                              onDownload={handleDownload}
                              downloadLabel={result.keptOriginal ? 'Download original' : 'Download PDF'}
                            />
                          )}
                        </div>

                        {preview && (
                          <div className="mt-5 border-t border-border pt-5">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Before and after
                            </h3>
                            <div className="flex flex-wrap gap-4">
                              {([['Before', preview.before], ['After', preview.after]] as const).map(([label, src]) => (
                                <figure key={label} className="w-40">
                                  <img
                                    src={src}
                                    alt={`Page ${result.rasterizedPages[0]} ${label.toLowerCase()} compression`}
                                    className="w-full rounded-lg border border-border bg-secondary"
                                  />
                                  <figcaption className="mt-1.5 text-xs text-muted-foreground">{label}</figcaption>
                                </figure>
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    )}

                  </div>
                )}
              </>
            )}
          </UploadZone>

          {!file && !isAnalyzing && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Minimize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Your original file is kept whenever compressing wouldn&apos;t help
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Processed locally — nothing is uploaded
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CompressPDF;
