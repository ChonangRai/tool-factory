import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileSearch, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { analyzePDF, type DocumentAnalysis } from '@/lib/pdfAnalysis';
import {
  OcrCancelledError,
  ocrEligiblePages,
  ocrPdf,
  ocrTextFile,
  parsePageRange,
  type OcrProgress,
  type OcrResult,
} from '@/lib/ocr';
import { downloadBlob } from '@/lib/download';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

const baseName = (name: string) => name.replace(/\.pdf$/i, '');

const listPages = (pages: number[]) => {
  if (pages.length <= 6) return pages.join(', ');
  return `${pages.slice(0, 6).join(', ')} and ${pages.length - 6} more`;
};

const OcrPDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [eligible, setEligible] = useState<number[]>([]);
  const [scope, setScope] = useState<'all' | 'range'>('all');
  const [range, setRange] = useState('');
  const [result, setResult] = useState<OcrResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setAnalysis(null);
    setEligible([]);
    setScope('all');
    setRange('');
    setResult(null);
    setProgress(null);
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const selected = files[0];
    if (!selected) return;
    if (files.length > 1) {
      toast({ title: 'Only one PDF at a time', description: 'Using the first file you selected.' });
    }

    setIsAnalyzing(true);
    setResult(null);
    setProgress(null);
    try {
      const { valid, errors } = await validatePDFFiles([selected], 0, 0);
      if (errors.length > 0 || valid.length === 0) {
        toast({ title: 'Upload failed', description: errors[0] ?? 'Could not read this PDF.', variant: 'destructive' });
        reset();
        return;
      }

      const validFile = valid[0].file;
      const inspected = await analyzePDF(validFile);
      setFile(validFile);
      setAnalysis(inspected);
      setEligible(ocrEligiblePages(inspected));
      setScope('all');
      setRange('');
    } catch (error) {
      console.error('Failed to analyse PDF', error);
      toast({ title: 'Unable to open PDF', description: 'This file could not be read.', variant: 'destructive' });
      reset();
    } finally {
      setIsAnalyzing(false);
    }
  }, [reset]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({ title: 'Not a PDF file', description: fileNames.join(', '), variant: 'destructive' });
  }, []);

  const selectedPages =
    scope === 'all' ? eligible : parsePageRange(range, analysis?.pageCount ?? 0).filter((page) => eligible.includes(page));

  const runOcr = useCallback(async () => {
    if (!file || selectedPages.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setResult(null);
    setProgress({ stage: 'engine', current: 0, total: selectedPages.length, engineProgress: 0 });

    try {
      const outcome = await ocrPdf(file, {
        pageNumbers: selectedPages,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(outcome);
      if (outcome.wordCount === 0) {
        toast({
          title: 'No text recognised',
          description: 'Nothing legible was found on the selected pages, so the PDF is unchanged.',
        });
      }
    } catch (error) {
      if (error instanceof OcrCancelledError || controller.signal.aborted) {
        toast({ title: 'OCR cancelled', description: 'Nothing was changed.' });
      } else {
        console.error('OCR failed', error);
        toast({ title: 'OCR failed', description: 'This PDF could not be processed.', variant: 'destructive' });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setProgress(null);
    }
  }, [file, selectedPages]);

  const handleDownloadPdf = useCallback(() => {
    if (!result || !file) return;
    downloadBlob(result.blob, `${baseName(file.name)}-searchable.pdf`);
  }, [file, result]);

  const handleDownloadText = useCallback(() => {
    if (!result || !file) return;
    downloadBlob(ocrTextFile(result.pages), `${baseName(file.name)}.txt`);
  }, [file, result]);

  const unsupported = analysis?.unsupported ?? null;
  const isWorking = progress !== null;
  const alreadySearchable = analysis?.pages.filter((page) => page.hasMeaningfulText).map((page) => page.pageNumber) ?? [];

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="Make a scan searchable"
            description="Reads the text in a scanned PDF and adds it back as an invisible layer, so you can search and copy it. Everything runs in your browser."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={
              file && analysis && !isAnalyzing
                ? `${file.name} · ${analysis.pageCount} ${analysis.pageCount === 1 ? 'page' : 'pages'}`
                : undefined
            }
            actions={
              file && !isAnalyzing && !isWorking ? (
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
            dropLabel="Drop a scanned PDF"
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
                          <h2 className="text-sm font-semibold text-foreground">This PDF can&apos;t be processed</h2>
                          <p className="text-sm text-muted-foreground">{unsupported.message}</p>
                        </div>
                      </div>
                    ) : (
                      <section className="rounded-xl border border-border bg-card p-5">
                        {eligible.length === 0 ? (
                          <>
                            <h2 className="text-base font-semibold text-foreground">
                              {alreadySearchable.length > 0 ? 'This PDF is already searchable' : 'Nothing here to read'}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {alreadySearchable.length > 0
                                ? 'Every page already carries real text, so you can search and copy it as it is. Running OCR would only add a worse copy of what is already there.'
                                : 'No scanned pages were found in this document. OCR only helps with pages that are pictures of text.'}
                            </p>
                          </>
                        ) : (
                          <>
                            <h2 className="text-base font-semibold text-foreground">
                              {eligible.length} scanned {eligible.length === 1 ? 'page' : 'pages'} to read
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {alreadySearchable.length > 0
                                ? `Pages ${listPages(alreadySearchable)} already contain real text and are left exactly as they are. `
                                : ''}
                              The scan itself is never redrawn — the recognised words are added underneath it, invisibly.
                            </p>

                            <div className="mt-4 space-y-3">
                              <span
                                id="ocr-scope-label"
                                className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Pages
                              </span>
                              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ocr-scope-label">
                                <Button
                                  size="sm"
                                  variant={scope === 'all' ? 'default' : 'outline'}
                                  onClick={() => setScope('all')}
                                  aria-pressed={scope === 'all'}
                                  disabled={isWorking}
                                >
                                  All {eligible.length} scanned {eligible.length === 1 ? 'page' : 'pages'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={scope === 'range' ? 'default' : 'outline'}
                                  onClick={() => setScope('range')}
                                  aria-pressed={scope === 'range'}
                                  disabled={isWorking}
                                >
                                  Choose pages
                                </Button>
                              </div>

                              {scope === 'range' && (
                                <div className="space-y-1.5">
                                  <label htmlFor="ocr-range" className="text-sm text-muted-foreground">
                                    Page numbers, for example <span className="font-medium text-foreground">1-3, 7</span>
                                  </label>
                                  <Input
                                    id="ocr-range"
                                    value={range}
                                    onChange={(event) => setRange(event.target.value)}
                                    placeholder={`1-${analysis.pageCount}`}
                                    className="max-w-xs"
                                    disabled={isWorking}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {selectedPages.length > 0
                                      ? `${selectedPages.length} scanned ${
                                          selectedPages.length === 1 ? 'page' : 'pages'
                                        } selected: ${listPages(selectedPages)}`
                                      : 'Pages that already have text, or that are not in the document, are ignored.'}
                                  </p>
                                </div>
                              )}
                            </div>

                            <Button
                              className="mt-4 w-full sm:w-auto"
                              onClick={runOcr}
                              disabled={isWorking || selectedPages.length === 0}
                            >
                              {isWorking ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <FileSearch className="mr-2 h-4 w-4" aria-hidden="true" />
                              )}
                              Read {selectedPages.length || eligible.length}{' '}
                              {(selectedPages.length || eligible.length) === 1 ? 'page' : 'pages'}
                            </Button>

                            <p className="mt-3 text-xs text-muted-foreground">
                              Best results on clear scanned documents. Photos, faint or crooked scans and unusual
                              layouts will contain mistakes. English only.
                              {selectedPages.length >= 20 &&
                                ' Reading this many pages takes a while — roughly a minute per 25 pages on a laptop, and longer on a phone.'}{' '}
                              The first run downloads the OCR engine and English model (about 5MB) and keeps them in
                              your browser for next time — your PDF is not part of that, and is never uploaded.
                            </p>
                          </>
                        )}
                      </section>
                    )}

                    {progress && (
                      <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3" aria-live="polite">
                        <div className="flex items-center gap-3">
                          <Progress
                            value={
                              progress.stage === 'engine'
                                ? progress.engineProgress * 100
                                : (progress.current / Math.max(1, progress.total)) * 100
                            }
                            aria-label="OCR progress"
                          />
                          <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                            Cancel
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {progress.stage === 'engine' && 'Getting the OCR engine ready…'}
                          {progress.stage === 'page' && `Reading page ${progress.current} of ${progress.total}`}
                          {progress.stage === 'saving' && 'Building your searchable PDF…'}
                        </p>
                      </div>
                    )}

                    {result && (
                      <section className="rounded-xl border border-border bg-card p-5" aria-live="polite">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {result.wordCount.toLocaleString()} {result.wordCount === 1 ? 'word' : 'words'} found on{' '}
                                {result.ocrPageNumbers.length} {result.ocrPageNumbers.length === 1 ? 'page' : 'pages'}
                              </p>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {result.wordCount > 0
                                  ? `Average confidence ${Math.round(result.confidence)}%. Check anything important — OCR is never perfect.`
                                  : 'Nothing legible was found, so your pages are unchanged.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button onClick={handleDownloadPdf}>
                              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                              Searchable PDF
                            </Button>
                            <Button variant="outline" onClick={handleDownloadText} disabled={result.wordCount === 0}>
                              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                              Text file
                            </Button>
                          </div>
                        </div>
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
                <FileSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
                Best results on clear scanned documents
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

export default OcrPDF;
