import { useEffect, useMemo, useState } from 'react';
import { Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { everyPageParts, groupParts, parseRanges, type SplitMode, type SplitPart } from '@/lib/splitPlan';
import type { PageGroup, WorkspacePage } from '@/lib/workspaceDoc';

interface SplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: WorkspacePage[];
  groups: PageGroup[];
  isSplitting: boolean;
  progress: { done: number; total: number } | null;
  onSplit: (parts: SplitPart[]) => void;
}

/**
 * Split means "one document in, several documents out", so the dialog is about
 * choosing where the cuts fall. Extract -- selected pages into one new PDF --
 * is a separate action in the toolbar and deliberately not a mode here.
 */
const SplitDialog = ({ open, onOpenChange, pages, groups, isSplitting, progress, onSplit }: SplitDialogProps) => {
  const hasGroups = groups.length > 0;
  const [mode, setMode] = useState<SplitMode>(hasGroups ? 'groups' : 'ranges');
  const [ranges, setRanges] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(hasGroups ? 'groups' : 'ranges');
    // Offer the whole document as one range so the shape of the answer is
    // obvious before anything is typed.
    setRanges(pages.length > 0 ? `1-${pages.length}` : '');
  }, [open, hasGroups, pages.length]);

  const parsed = useMemo(() => parseRanges(ranges, pages.length), [ranges, pages.length]);

  const parts = useMemo<SplitPart[]>(() => {
    if (mode === 'every') return everyPageParts(pages);
    if (mode === 'groups') return groupParts(pages, groups);
    return parsed.parts;
  }, [mode, pages, groups, parsed.parts]);

  const error = mode === 'ranges' ? parsed.error : null;
  const canSplit = !isSplitting && parts.length > 0 && !error;

  const summary =
    parts.length === 0
      ? 'Nothing to split yet.'
      : parts.length === 1
        ? `1 PDF (${parts[0].positions.length} ${parts[0].positions.length === 1 ? 'page' : 'pages'}), downloaded on its own.`
        : `${parts.length} PDFs, downloaded together as a ZIP.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split into separate PDFs</DialogTitle>
          <DialogDescription>
            Every page stays in your browser. Choose where this document should be cut.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={value => setMode(value as SplitMode)} className="gap-3">
          <div className="flex items-start gap-3">
            <RadioGroupItem value="ranges" id="split-ranges" className="mt-1" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="split-ranges" className="font-medium">
                Custom ranges
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One PDF per range. This document has {pages.length} {pages.length === 1 ? 'page' : 'pages'}.
              </p>
              <Textarea
                value={ranges}
                // Typing is a clear choice of this mode; merely being focused
                // is not -- the dialog autofocuses this box, which would
                // otherwise silently override the group default on open.
                onChange={event => {
                  setRanges(event.target.value);
                  setMode('ranges');
                }}
                placeholder="1-5, 6-10, 11-22"
                rows={2}
                className="mt-2 font-mono text-sm"
                aria-label="Page ranges"
              />
            </div>
          </div>

          {hasGroups && (
            <div className="flex items-start gap-3">
              <RadioGroupItem value="groups" id="split-groups" className="mt-1" />
              <div className="min-w-0 flex-1">
                <Label htmlFor="split-groups" className="font-medium">
                  One PDF per group
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Uses the groups in the organiser. Pages that are not in a group are kept together as their
                  own file, so nothing is dropped.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <RadioGroupItem value="every" id="split-every" className="mt-1" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="split-every" className="font-medium">
                Split every page
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pages.length} single-page PDFs in one ZIP.
              </p>
            </div>
          </div>
        </RadioGroup>

        <p className={`text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error ?? summary}</p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSplitting}>
            Cancel
          </Button>
          <Button onClick={() => onSplit(parts)} disabled={!canSplit}>
            {isSplitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {progress ? `Building ${progress.done} of ${progress.total}…` : 'Splitting…'}
              </>
            ) : (
              <>
                <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
                Split
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SplitDialog;
