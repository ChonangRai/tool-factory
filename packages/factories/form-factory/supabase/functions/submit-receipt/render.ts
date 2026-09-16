// Pure receipt-email rendering. No Deno or network APIs so it can be unit
// tested directly. Every submitter- or form-author-controlled value is HTML
// escaped; submitted HTML is never rendered.

export interface ReceiptField {
  id: string;
  label?: string;
  type?: string;
  order?: number;
}

export interface ReceiptSubmission {
  id: string;
  created_at: string;
  name?: string | null;
  email?: string | null;
  contact_number?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
  field_snapshot?: ReceiptField[] | null;
  files?: { filename: string; field_id?: string | null }[] | null;
  forms?: { name?: string | null; settings?: { fields?: ReceiptField[] } | null } | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape first, then turn newlines into <br>, so line breaks survive without
// ever letting submitted markup through.
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function formatValue(type: string | undefined, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (type === 'checkbox' || typeof value === 'boolean') {
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
  }
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';
}

export function buildReceiptEmail(submission: ReceiptSubmission): { subject: string; html: string; text: string } {
  const formName = submission.forms?.name || 'Form Submission';
  const snapshot = Array.isArray(submission.field_snapshot) ? submission.field_snapshot : null;
  // Snapshot is authoritative (labels as the submitter saw them). Pre-038
  // submissions have no snapshot and no stored answers.
  const fields = [...(snapshot ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const data = submission.data ?? {};
  const files = submission.files ?? [];
  const fieldIds = new Set(fields.map((f) => f.id));

  const rows: { label: string; value: string }[] = [];
  for (const field of fields) {
    const value =
      field.type === 'file'
        ? files.filter((f) => f.field_id === field.id).map((f) => f.filename).join(', ')
        : formatValue(field.type, data[field.id]);
    if (value.trim()) rows.push({ label: field.label?.trim() || 'Untitled field', value });
  }

  const loose = files.filter((f) => !f.field_id || !fieldIds.has(f.field_id)).map((f) => f.filename);
  if (loose.length) rows.push({ label: 'Attachments', value: loose.join(', ') });

  if (!snapshot) {
    const legacy: [string, unknown][] = [
      ['Name', submission.name],
      ['Email', submission.email],
      ['Phone', submission.contact_number],
      ['Description', submission.description],
    ];
    for (const [label, value] of legacy) {
      if (value) rows.unshift({ label, value: String(value) });
    }
  }

  const submittedAt = formatDate(submission.created_at);

  const rowsHtml = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 12px 8px 0;vertical-align:top;color:#555;font-weight:600;white-space:nowrap;">${escapeHtml(r.label)}</td>
          <td style="padding:8px 0;vertical-align:top;color:#111;">${escapeMultiline(r.value)}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">
    <h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(formName)}</h1>
    <p style="margin:0 0 16px;color:#555;">Submission received${submittedAt ? ` &middot; ${escapeHtml(submittedAt)}` : ''}</p>
    <p style="margin:0 0 16px;">Thank you. Here is a copy of what you submitted:</p>
    ${
      rows.length
        ? `<table role="presentation" style="border-collapse:collapse;width:100%;border-top:1px solid #e5e5e5;">${rowsHtml}
    </table>`
        : '<p style="color:#555;">No answers were recorded.</p>'
    }
    <p style="margin:24px 0 0;color:#888;font-size:12px;">Reference: ${escapeHtml(submission.id)}</p>
  </body>
</html>`;

  const text = [
    `${formName}`,
    `Submission received${submittedAt ? ` - ${submittedAt}` : ''}`,
    '',
    ...rows.map((r) => `${r.label}:\n${r.value}\n`),
    `Reference: ${submission.id}`,
  ].join('\n');

  // Header value: strip CR/LF so a form name can't inject headers.
  const subject = `${formName} - Submission received`.replace(/[\r\n]+/g, ' ');

  return { subject, html, text };
}
