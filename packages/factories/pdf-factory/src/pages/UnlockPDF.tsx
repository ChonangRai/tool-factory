import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, Eye, EyeOff, Loader2, LockOpen, ShieldCheck } from 'lucide-react';
import { validateEncryptedPDFFile } from '@/lib/pdfValidation';
import { formatFileSize } from '@/lib/compress';
import { looksEncrypted, unlockedFileName, unlockPdf, UnlockError, type UnlockResult } from '@/lib/unlock';
import { downloadBlob } from '@/lib/download';
import { claimActivePdf, type ActivePdfMeta } from '@/lib/activePdf';
import { pdfFileFrom } from '@/lib/pdfBytes';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import CarriedFrom from '@/components/factory/CarriedFrom';
import ContinueWithPDF from '@/components/factory/ContinueWithPDF';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

const UnlockPDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [result, setResult] = useState<UnlockResult | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<ActivePdfMeta | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPassword('');
    setReveal(false);
    setBlocked(null);
    setResult(null);
    setCarriedFrom(null);
  }, []);

  const handleUpload = useCallback(async (files: File[]) => {
    const selected = files[0];
    if (!selected) return;
    if (files.length > 1) {
      toast({ title: 'Only one PDF at a time', description: 'Using the first file you selected.' });
    }

    setIsChecking(true);
    setResult(null);
    setBlocked(null);
    setPassword('');
    setCarriedFrom(null);
    try {
      // Encrypted input needs its own check: the ordinary validator opens the
      // document to count pages, which is precisely what a locked file refuses.
      const { file: valid, message } = await validateEncryptedPDFFile(selected, looksEncrypted);
      if (!valid) {
        toast({
          title: 'This PDF cannot be unlocked',
          description: message ?? 'Could not read this PDF.',
          variant: 'destructive',
        });
        reset();
        return;
      }
      setFile(valid);
    } catch (error) {
      console.error('Failed to inspect PDF', error);
      toast({ title: 'Unable to open PDF', description: 'This file could not be read.', variant: 'destructive' });
      reset();
    } finally {
      setIsChecking(false);
    }
  }, [reset]);

  // A PDF carried from Protect arrives encrypted, so it takes this route's own
  // upload path rather than the normal one.
  useEffect(() => {
    const carried = claimActivePdf();
    if (!carried) return;
    void handleUpload([carried.file]).then(() => setCarriedFrom(carried.meta));
  }, [handleUpload]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({ title: 'Not a PDF file', description: fileNames.join(', '), variant: 'destructive' });
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!file || password.length === 0) return;

    setIsWorking(true);
    setBlocked(null);
    setResult(null);
    // Let the busy state paint before decryption blocks the main thread.
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const outcome = await unlockPdf(file, password);
      setResult(outcome);
      // The password has done its job; don't keep it in component state.
      setPassword('');
      setReveal(false);
    } catch (error) {
      if (error instanceof UnlockError) {
        setBlocked(error.message);
      } else {
        // Never logged with the password: only the failure itself is reported.
        console.error('Failed to unlock PDF');
        setBlocked('Something went wrong while unlocking this PDF.');
      }
    } finally {
      setIsWorking(false);
    }
  }, [file, password]);

  const resultFile = useMemo(
    () => (result && file ? pdfFileFrom(result.blob, unlockedFileName(file.name)) : null),
    [file, result],
  );

  const handleDownload = useCallback(() => {
    if (!resultFile) return;
    downloadBlob(resultFile, resultFile.name);
  }, [resultFile]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="Unlock PDF"
            description="Remove a password from a PDF you can already open. The file is decrypted in your browser."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={
              file && !isChecking ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {file.name} · {formatFileSize(file.size)} · password protected
                  </span>
                  {carriedFrom && <CarriedFrom meta={carriedFrom} />}
                </span>
              ) : undefined
            }
            actions={
              file && !isChecking ? (
                <Button variant="outline" size="sm" onClick={reset}>
                  Choose a different PDF
                </Button>
              ) : undefined
            }
          />

          <UploadZone
            onUpload={handleUpload}
            onRejected={handleRejected}
            hasFiles={isChecking || !!file}
            dropLabel="Drop a password-protected PDF"
          >
            {() => (
              <>
                {isChecking && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                    <p>Checking your PDF…</p>
                  </div>
                )}

                {!isChecking && file && (
                  <div className="mx-auto max-w-xl space-y-5">
                    {result && resultFile ? (
                      <>
                        <section className="rounded-xl border border-border bg-card p-5" aria-live="polite">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                            </div>
                            <div>
                              <h2 className="text-sm font-semibold text-foreground">The password is removed</h2>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                                {formatFileSize(result.resultBytes)} · opens without a password
                              </p>
                            </div>
                          </div>
                          <Button onClick={handleDownload} className="mt-4 w-full">
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Download unlocked PDF
                          </Button>
                        </section>

                        <ContinueWithPDF file={resultFile} from="unlock" pageCount={result.pageCount} />
                      </>
                    ) : (
                      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
                        <div className="space-y-2">
                          <Label htmlFor="unlock-password">Password</Label>
                          <div className="relative">
                            <Input
                              id="unlock-password"
                              type={reveal ? 'text' : 'password'}
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void handleUnlock();
                              }}
                              autoComplete="off"
                              className="pr-11"
                              aria-describedby="unlock-password-hint"
                            />
                            <button
                              type="button"
                              onClick={() => setReveal((v) => !v)}
                              className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
                              aria-label={reveal ? 'Hide password' : 'Show password'}
                              aria-pressed={reveal}
                            >
                              {reveal ? (
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                          <p id="unlock-password-hint" className="text-xs text-muted-foreground">
                            The password you use to open this PDF. It is used here and then forgotten — it is never
                            stored, and never sent anywhere.
                          </p>
                        </div>

                        {blocked && (
                          <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                            <p className="text-sm text-muted-foreground">{blocked}</p>
                          </div>
                        )}

                        <Button onClick={handleUnlock} disabled={isWorking || password.length === 0} className="w-full">
                          {isWorking ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <LockOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                          )}
                          {isWorking ? 'Unlocking…' : 'Unlock PDF'}
                        </Button>

                        <p className="text-sm text-muted-foreground">
                          This removes a password you already know. It cannot recover or guess a forgotten one.
                        </p>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </UploadZone>

          {!file && !isChecking && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <LockOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                For PDFs you can already open — passwords are not recovered
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

export default UnlockPDF;
