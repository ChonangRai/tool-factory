import { format } from 'date-fns';
import { Download, Eye, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  formatAnswer,
  groupAnswersBySection,
  hasStoredAnswers,
  isAnswered,
  resolveAnswers,
  resolveColumns,
  type SubmissionFile,
  type SubmissionRecord,
} from '@/lib/submissionAnswers';
import { normalizeFormSettings } from '@/lib/formSections';

interface SubmissionDetailProps {
  submission: (SubmissionRecord & { forms?: { name?: string; settings?: unknown } | null }) | null;
  onOpenChange: (open: boolean) => void;
  onView: (file: SubmissionFile) => void;
  onDownload: (file: SubmissionFile) => void;
}

export function SubmissionDetail({ submission, onOpenChange, onView, onDownload }: SubmissionDetailProps) {
  const legacy = submission ? !hasStoredAnswers(submission) : false;
  const answers = submission
    ? resolveAnswers(
        // Legacy rows have no snapshot and no stored answers: only list their
        // attachments rather than a column of misleading blanks.
        resolveColumns(legacy ? [] : normalizeFormSettings(submission.forms?.settings), [submission]),
        submission
      )
    : [];
  // Grouped by the section titles captured at submit time, so later renames
  // or moves do not rewrite history.
  const sections = groupAnswersBySection(answers);

  const summary = submission
    ? [
        ['Name', submission.name],
        ['Email', submission.email],
        ['Phone', submission.contact_number],
        ['Description', submission.description],
      ].filter(([, v]) => v)
    : [];

  return (
    <Sheet open={!!submission} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {submission && (
          <>
            <SheetHeader>
              <SheetTitle>{submission.forms?.name || 'Submission'}</SheetTitle>
              <SheetDescription>
                Submitted {format(new Date(submission.created_at), 'MMM dd, yyyy HH:mm')}
              </SheetDescription>
            </SheetHeader>

            <dl className="mt-6 space-y-4">
              {legacy &&
                summary.map(([label, value]) => (
                  <AnswerRow key={label} label={label as string}>
                    <span className="whitespace-pre-wrap break-words">{value}</span>
                  </AnswerRow>
                ))}

              {sections.map((group, groupIndex) => (
                <div key={`${group.title}-${groupIndex}`} className="space-y-4">
                  {group.title && (
                    <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h3>
                  )}
                  {group.answers.map((answer) => (
                <AnswerRow key={answer.id} label={answer.label}>
                  {answer.type === 'file' ? (
                    answer.files.length ? (
                      <ul className="space-y-1">
                        {answer.files.map((file) => (
                          <li key={file.id} className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate" title={file.filename}>
                              {file.filename}
                            </span>
                            {file.mime?.startsWith('image/') && (
                              <Button variant="ghost" size="sm" onClick={() => onView(file)} aria-label="Preview">
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => onDownload(file)} aria-label="Download">
                              <Download className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Unanswered />
                    )
                  ) : isAnswered(answer) ? (
                    <span className="whitespace-pre-wrap break-words">{formatAnswer(answer)}</span>
                  ) : (
                    <Unanswered />
                  )}
                </AnswerRow>
                  ))}
                </div>
              ))}
            </dl>

            {legacy && (
              <p className="mt-6 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                This submission was received before full answers were stored. Only the
                summary details above were saved.
              </p>
            )}

            <p className="mt-6 text-xs text-muted-foreground">Reference: {submission.id}</p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AnswerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b pb-3">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Unanswered() {
  return <span className="italic text-muted-foreground">No answer</span>;
}
