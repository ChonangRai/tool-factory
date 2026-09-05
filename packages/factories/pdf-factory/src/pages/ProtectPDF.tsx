import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { validatePDFFiles } from '@/lib/pdfValidation';
import { formatFileSize } from '@/lib/compress';
import {
  checkPassword,
  passwordByteLength,
  passwordStrength,
  protectPDF,
  protectedFileName,
  ProtectError,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  type ProtectResult,
} from '@/lib/protect';
import { downloadBlob } from '@/lib/download';
import Header from '@/components/factory/Header';
import PageHeader from '@/components/factory/PageHeader';
import UploadZone from '@/components/factory/UploadZone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

const STRENGTH_COPY = {
  weak: { label: 'Weak', className: 'text-destructive' },
  fair: { label: 'Fair', className: 'text-amber-600' },
  strong: { label: 'Strong', className: 'text-primary' },
} as const;

const ProtectPDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<ProtectResult | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const check = useMemo(() => checkPassword(password, confirmation), [password, confirmation]);
  const strength = useMemo(() => passwordStrength(password), [password]);
  const byteLength = useMemo(() => passwordByteLength(password), [password]);

  const reset = useCallback(() => {
    setFile(null);
    setPageCount(0);
    setPassword('');
    setConfirmation('');
    setReveal(false);
    setTouched(false);
    setResult(null);
    setBlocked(null);
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
    try {
      const { valid, errors } = await validatePDFFiles([selected], 0, 0);
      if (errors.length > 0 || valid.length === 0) {
        toast({ title: 'Upload failed', description: errors[0] ?? 'Could not read this PDF.', variant: 'destructive' });
        reset();
        return;
      }
      setFile(valid[0].file);
      setPageCount(valid[0].pageCount);
    } finally {
      setIsChecking(false);
    }
  }, [reset]);

  const handleRejected = useCallback((fileNames: string[]) => {
    toast({ title: 'Not a PDF file', description: fileNames.join(', '), variant: 'destructive' });
  }, []);

  const handleProtect = useCallback(async () => {
    if (!file) return;
    setTouched(true);
    if (check.problem) return;

    setIsWorking(true);
    setBlocked(null);
    setResult(null);
    // Let the busy state paint before the encryption blocks the main thread.
    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const outcome = await protectPDF(file, password);
      setResult(outcome);
      // The password has done its job; don't keep it in component state.
      setPassword('');
      setConfirmation('');
      setReveal(false);
      setTouched(false);
    } catch (error) {
      if (error instanceof ProtectError) {
        setBlocked(error.message);
      } else {
        console.error('Failed to protect PDF', error);
        setBlocked('Something went wrong while protecting this PDF.');
      }
    } finally {
      setIsWorking(false);
    }
  }, [check.problem, file, password]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    downloadBlob(result.blob, protectedFileName(file.name));
  }, [file, result]);

  const showError = touched && check.problem !== null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell space-y-6 py-6 sm:py-8">
          <PageHeader
            title="Protect PDF"
            description="Add a password that must be entered to open the PDF. The file is encrypted in your browser."
            backTo={{ href: '/factory', label: 'PDF Workspace' }}
            meta={
              file && !isChecking
                ? `${file.name} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${formatFileSize(file.size)}`
                : undefined
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
            dropLabel="Drop a PDF to protect"
          >
            {() => (
              <>
                {isChecking && (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                    <p>Opening PDF…</p>
                  </div>
                )}

                {!isChecking && file && (
                  <div className="mx-auto max-w-xl space-y-5">
                    {result ? (
                      <section className="rounded-xl border border-border bg-card p-5" aria-live="polite">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold text-foreground">Your PDF is protected</h2>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                              {formatFileSize(result.resultBytes)} · encrypted with AES-256
                            </p>
                          </div>
                        </div>
                        <Button onClick={handleDownload} className="mt-4 w-full">
                          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                          Download protected PDF
                        </Button>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Store your password somewhere safe before you close this page.
                        </p>
                      </section>
                    ) : (
                      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
                        <div className="space-y-2">
                          <Label htmlFor="protect-password">Password</Label>
                          <div className="relative">
                            <Input
                              id="protect-password"
                              type={reveal ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onBlur={() => setTouched(true)}
                              autoComplete="new-password"
                              className="pr-11"
                              aria-describedby="protect-password-hint"
                            />
                            <button
                              type="button"
                              onClick={() => setReveal((v) => !v)}
                              className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
                              aria-label={reveal ? 'Hide password' : 'Show password'}
                              aria-pressed={reveal}
                            >
                              {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                            </button>
                          </div>
                          <p id="protect-password-hint" className="text-xs text-muted-foreground">
                            At least {PASSWORD_MIN_LENGTH} characters.{' '}
                            {password.length > 0 && (
                              <>
                                Looks <span className={STRENGTH_COPY[strength].className}>{STRENGTH_COPY[strength].label.toLowerCase()}</span> —
                                a longer passphrase is harder to guess, though no hint can promise safety.
                              </>
                            )}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="protect-confirm">Confirm password</Label>
                          <Input
                            id="protect-confirm"
                            type={reveal ? 'text' : 'password'}
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            onBlur={() => setTouched(true)}
                            autoComplete="new-password"
                          />
                        </div>

                        {showError && (
                          <p className="text-sm text-destructive" role="alert">
                            {check.message}
                          </p>
                        )}
                        {!showError && byteLength > PASSWORD_MAX_BYTES && (
                          <p className="text-sm text-destructive" role="alert">
                            This password is too long for the PDF format.
                          </p>
                        )}

                        <div className="flex gap-3 rounded-lg bg-secondary/60 p-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                          <p className="text-sm text-muted-foreground">
                            If you forget this password, Tool Factory cannot recover it. Your PDF and password never
                            leave your device.
                          </p>
                        </div>

                        {blocked && (
                          <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                            <p className="text-sm text-muted-foreground">{blocked}</p>
                          </div>
                        )}

                        <Button onClick={handleProtect} disabled={isWorking} className="w-full">
                          {isWorking ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                          )}
                          {isWorking ? 'Encrypting…' : 'Protect PDF'}
                        </Button>
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
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                Real AES-256 encryption, not a viewer setting
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Encrypted locally — nothing is uploaded
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ProtectPDF;
