import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DynamicField } from './DynamicField';
import type { FormField } from '@/types/formFields';
import {
  groupFieldsBySection,
  sectionHeading,
  type NormalizedSettings,
  type SectionWithFields,
} from '@/lib/formSections';
import { validateFields } from '@/lib/formValidation';
import { formatAnswer } from '@/lib/submissionAnswers';
import { clearDraft, computeFingerprint, loadDraft, saveDraft } from '@/lib/formDraft';

interface SectionedFormProps {
  settings: NormalizedSettings;
  onSubmit: (values: Record<string, unknown>) => void;
  /** Busy state: blocks navigation and submission while work is in flight. */
  isSubmitting?: boolean;
  /**
   * Blocks only the final submit (e.g. the human check, which lives beside
   * the submit button on the last step). Navigation must stay usable, or a
   * multi-step form could never reach the step that carries the check.
   */
  submitDisabled?: boolean;
  /** Rendered on the last step, above the submit button (receipt opt-in, Turnstile). */
  children?: React.ReactNode;
  submitLabel?: string;
  /**
   * Form id to keep unfinished answers under, in this browser only. Omitted
   * (the builder preview) means nothing is stored.
   */
  draftFormId?: string;
}

// The one renderer for a form definition: public submission, and the
// builder's preview. One section per step; a Review step is added only when
// there is more than one section, so a short single-section form still reads
// as a plain form rather than a wizard.
export function SectionedForm({
  settings,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  children,
  submitLabel = 'Submit form',
  draftFormId,
}: SectionedFormProps) {
  const groups = useMemo(() => groupFieldsBySection(settings), [settings]);
  const hasReview = groups.length > 1;
  const stepCount = groups.length + (hasReview ? 1 : 0);

  // Progress is kept only when the collector allows it and we know the form.
  const persistDraft = Boolean(draftFormId) && settings.saveProgress;
  const fingerprint = useMemo(() => computeFingerprint(settings), [settings]);
  const [draftNotice, setDraftNotice] = useState<'restored' | 'schema-changed' | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const movedRef = useRef(false);

  // Restore once, before anything is typed. A draft written against a
  // different definition is dropped rather than mapped onto the new one.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !draftFormId) return;
    restoredRef.current = true;
    if (!settings.saveProgress) {
      clearDraft(draftFormId);
      return;
    }
    const result = loadDraft(draftFormId, fingerprint);
    if (result.status === 'restored') {
      setValues(result.draft.values);
      setStep(Math.min(result.draft.step, groups.length + (hasReview ? 1 : 0) - 1));
      setDraftNotice('restored');
    } else if (result.status === 'schema-changed') {
      setDraftNotice('schema-changed');
    }
  }, [draftFormId, settings.saveProgress, fingerprint, groups.length, hasReview]);

  // Debounced so typing does not write on every keystroke; the step is part
  // of the draft, so Back/Next moves the saved location too.
  useEffect(() => {
    if (!persistDraft || !restoredRef.current) return;
    const id = window.setTimeout(() => saveDraft(draftFormId!, fingerprint, step, values), 600);
    return () => window.clearTimeout(id);
  }, [persistDraft, draftFormId, fingerprint, step, values]);

  const handleClearDraft = () => {
    if (draftFormId) clearDraft(draftFormId);
    setValues({});
    setErrors({});
    setStep(0);
    setDraftNotice(null);
    // Saving stays on: an empty draft simply removes the key again.
  };

  const onReview = hasReview && step === groups.length;
  const current: SectionWithFields | undefined = groups[step];

  // Focus the new step's heading so keyboard and screen-reader users land in
  // the right place; the live region announces where they are.
  useEffect(() => {
    if (!movedRef.current) return;
    movedRef.current = false;
    headingRef.current?.focus();
    const title = onReview ? 'Review and submit' : sectionHeading(groups[step]?.section ?? { id: '', title: '', order: 0 });
    setAnnouncement(
      stepCount > 1
        ? `Step ${step + 1} of ${stepCount}${title ? `: ${title}` : ''}`
        : title
    );
  }, [step, onReview, groups, stepCount]);

  const goTo = (next: number) => {
    movedRef.current = true;
    setStep(next);
    // Reduced-motion users get an instant jump; everyone else a smooth one.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const setValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleNext = () => {
    const stepErrors = validateFields(current?.fields ?? [], values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      reportErrors(stepErrors, current?.fields ?? []);
      return;
    }
    goTo(step + 1);
  };

  // Focusing happens in an effect after the errors render, not in a
  // requestAnimationFrame callback: rAF never fires while the tab is in the
  // background, which would silently drop the focus move.
  useEffect(() => {
    if (!focusFieldId) return;
    const container = document.getElementById(`field-${focusFieldId}`);
    container?.scrollIntoView({ block: 'center' });
    container?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    setFocusFieldId(null);
  }, [focusFieldId]);

  const reportErrors = (stepErrors: Record<string, string>, fields: FormField[]) => {
    const count = Object.keys(stepErrors).length;
    const first = fields.find((f) => stepErrors[f.id]);
    setAnnouncement(
      `${count} ${count === 1 ? 'answer needs' : 'answers need'} attention. ${first ? stepErrors[first.id] : ''}`
    );
    if (first) setFocusFieldId(first.id);
  };

  const isLastStep = step === stepCount - 1;
  const hasFileField = settings.fields.some((f) => f.type === 'file');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Pressing Enter in a field implicitly submits the form. On any step but
    // the last that should advance, not submit.
    if (!isLastStep) {
      handleNext();
      return;
    }
    // The whole form is validated again, not just the visible step: a field
    // could have been emptied after its own step was passed.
    const allErrors = validateFields(settings.fields, values);
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      // Send the submitter to the first section that actually has a problem.
      const firstBad = groups.findIndex((g) => g.fields.some((f) => allErrors[f.id]));
      if (firstBad >= 0 && firstBad !== step) goTo(firstBad);
      reportErrors(allErrors, firstBad >= 0 ? groups[firstBad].fields : settings.fields);
      return;
    }
    // The draft is cleared by the caller once the submission is accepted, so
    // a failed submit does not lose what was typed.
    onSubmit(values);
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {draftNotice && (
        <div className="flex flex-wrap items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Save className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {draftNotice === 'restored' ? (
              <>
                <p className="font-medium">Progress restored from this device</p>
                <p className="text-muted-foreground">
                  Unfinished answers are kept in this browser for 24 hours and are not submitted yet.
                  {hasFileField && ' Any files you picked before need to be selected again.'}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">This form changed since you last visited</p>
                <p className="text-muted-foreground">
                  Your earlier saved answers no longer fit the form, so they were not restored.
                </p>
              </>
            )}
          </div>
          {draftNotice === 'restored' ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleClearDraft}>
              Clear saved progress
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraftNotice(null)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {stepCount > 1 && (
        <div className="space-y-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={stepCount}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${stepCount}`}
          >
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-all"
              style={{ width: `${((step + 1) / stepCount) * 100}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {stepCount}</p>
        </div>
      )}

      {onReview ? (
        <ReviewStep
          groups={groups}
          values={values}
          headingRef={headingRef}
          onEdit={(index) => goTo(index)}
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {(sectionHeading(current?.section ?? { id: '', title: '', order: 0 }) || current?.section.description) && (
              <header className="space-y-1">
                <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
                  {sectionHeading(current!.section)}
                </h2>
                {current?.section.description && (
                  <p className="text-sm text-muted-foreground">{current.section.description}</p>
                )}
              </header>
            )}
            {!sectionHeading(current?.section ?? { id: '', title: '', order: 0 }) && !current?.section.description && (
              // Keep a focus target even when the section is unnamed.
              <h2 ref={headingRef} tabIndex={-1} className="sr-only">
                {stepCount > 1 ? `Step ${step + 1} of ${stepCount}` : 'Form'}
              </h2>
            )}

            {(current?.fields ?? []).map((field) => (
              <div key={field.id} id={`field-${field.id}`}>
                <DynamicField
                  field={field}
                  value={values[field.id]}
                  onChange={(value) => setValue(field.id, value)}
                  error={errors[field.id]}
                />
              </div>
            ))}
            {(current?.fields ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">This section has no questions.</p>
            )}
          </CardContent>
        </Card>
      )}

      {isLastStep && children && <div className="rounded-lg border p-4">{children}</div>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => goTo(step - 1)} className="sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        {isLastStep ? (
          <Button type="submit" disabled={isSubmitting || submitDisabled} className="sm:w-auto">
            {isSubmitting ? 'Submitting...' : submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} disabled={isSubmitting} className="sm:w-auto">
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}

function ReviewStep({
  groups,
  values,
  headingRef,
  onEdit,
}: {
  groups: SectionWithFields[];
  values: Record<string, unknown>;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onEdit: (index: number) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <header className="space-y-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Review and submit
          </h2>
          <p className="text-sm text-muted-foreground">
            Check your answers. You can go back and change anything.
          </p>
        </header>

        {groups.map((group, index) => (
          <section key={group.section.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b pb-1">
              <h3 className="font-medium">{sectionHeading(group.section) || `Section ${index + 1}`}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(index)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
                <span className="sr-only"> {sectionHeading(group.section) || `section ${index + 1}`}</span>
              </Button>
            </div>
            <dl className="space-y-2">
              {group.fields.map((field) => (
                <div key={field.id} className="grid gap-0.5 sm:grid-cols-3">
                  <dt className="text-sm text-muted-foreground">{field.label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm sm:col-span-2">
                    {displayValue(field, values[field.id]) || (
                      <span className="italic text-muted-foreground">Not answered</span>
                    )}
                  </dd>
                </div>
              ))}
              {group.fields.length === 0 && (
                <p className="text-sm text-muted-foreground">No questions in this section.</p>
              )}
            </dl>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

// Attachments are still File objects at this point, so they are shown by
// name; everything else reuses the stored-answer formatting.
function displayValue(field: FormField, value: unknown): string {
  if (field.type === 'file') return value instanceof File ? value.name : '';
  return formatAnswer({ type: field.type, value, files: [] });
}
