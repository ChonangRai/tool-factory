// Run: node --test supabase/functions/submit-receipt/render.test.ts
//  or: deno test supabase/functions/submit-receipt/render.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptEmail } from './render.ts';

const base = {
  id: '11111111-1111-1111-1111-111111111111',
  created_at: '2026-09-16T10:05:00Z',
  forms: { name: 'Expense <Claim>' },
  field_snapshot: [
    { id: 'f_name', label: 'Full name', type: 'text', order: 0 },
    { id: 'f_notes', label: 'Notes', type: 'textarea', order: 1 },
    { id: 'f_ok', label: 'Agree', type: 'checkbox', order: 2 },
    { id: 'f_tags', label: 'Tags', type: 'select', order: 3 },
    { id: 'f_blank', label: 'Optional', type: 'text', order: 4 },
    { id: 'f_file', label: 'Receipt', type: 'file', order: 5 },
  ],
  data: {
    f_name: '<script>alert(1)</script>',
    f_notes: 'line one\nline <b>two</b>',
    f_ok: true,
    f_tags: ['a', 'b'],
    f_blank: '',
  },
  files: [{ filename: 'scan "1".png', field_id: 'f_file' }],
};

test('renders every answered field with labels, escaped', () => {
  const { html, text, subject } = buildReceiptEmail(base);
  assert.match(html, /Expense &lt;Claim&gt;/);
  assert.match(html, /Full name/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>two/);
  assert.match(html, /line one<br>line &lt;b&gt;two&lt;\/b&gt;/);
  assert.match(html, />Yes</);
  assert.match(html, />a, b</);
  assert.match(html, /scan &quot;1&quot;\.png/);
  assert.doesNotMatch(html, /Optional/);
  assert.match(html, /16 Sept? 2026, 10:05 UTC/);
  assert.match(html, /Reference: 11111111/);
  assert.doesNotMatch(html, /https?:\/\//); // no file URLs
  assert.match(text, /Notes:\nline one\nline <b>two<\/b>/);
  assert.equal(subject, 'Expense <Claim> - Submission received');
});

test('subject strips CR/LF', () => {
  const { subject } = buildReceiptEmail({ ...base, forms: { name: 'A\r\nBcc: x@y' } });
  assert.doesNotMatch(subject, /[\r\n]/);
});

test('legacy submission (no snapshot) falls back to summary columns', () => {
  const { html } = buildReceiptEmail({
    id: base.id,
    created_at: base.created_at,
    name: 'Jo',
    description: 'desc',
    data: {},
    field_snapshot: null,
    files: [{ filename: 'old.pdf', field_id: null }],
  });
  assert.match(html, />Name</);
  assert.match(html, />Jo</);
  assert.match(html, />Attachments</);
  assert.match(html, /old\.pdf/);
});
