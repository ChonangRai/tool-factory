import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { duplicateOptionIndexes } from '@/lib/fieldOptions';

interface OptionsEditorProps {
  // Initial options; the editor owns its draft rows after mount. Remount
  // (via `key`) to load a different field.
  value: string[];
  onChange: (options: string[]) => void;
}

interface Row {
  key: number;
  value: string;
}

// One single-line input per option. Enter adds the next option, Backspace on
// an empty option removes it, and pasting multi-line text splits into rows,
// so a line break can never end up inside an option.
export function OptionsEditor({ value, onChange }: OptionsEditorProps) {
  const nextKey = useRef(0);
  const makeRow = (v: string): Row => ({ key: nextKey.current++, value: v });
  const [rows, setRows] = useState<Row[]>(() => (value.length ? value : ['']).map(makeRow));
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (focusKey === null) return;
    inputs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(next.map((r) => r.value));
  };

  const insertAfter = (index: number, values: string[] = ['']) => {
    const added = values.map(makeRow);
    commit([...rows.slice(0, index + 1), ...added, ...rows.slice(index + 1)]);
    setFocusKey(added[added.length - 1].key);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    if (next.length === 0) {
      const blank = makeRow('');
      commit([blank]);
      setFocusKey(blank.key);
      return;
    }
    commit(next);
    setFocusKey(next[Math.max(0, index - 1)].key);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
    setFocusKey(next[target].key);
  };

  const dupes = duplicateOptionIndexes(rows.map((r) => r.value));

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{index + 1}.</span>
            <Input
              ref={(el) => {
                if (el) inputs.current.set(row.key, el);
                else inputs.current.delete(row.key);
              }}
              value={row.value}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              aria-invalid={dupes.has(index) || undefined}
              className={cn(dupes.has(index) && 'border-destructive focus-visible:ring-destructive')}
              onChange={(e) =>
                commit(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
              }
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  insertAfter(index);
                } else if (e.key === 'Backspace' && row.value === '' && rows.length > 1) {
                  e.preventDefault();
                  remove(index);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (!/[\r\n]/.test(text)) return;
                e.preventDefault();
                const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                if (!lines.length) return;
                const [first, ...rest] = lines;
                const el = e.currentTarget;
                const merged =
                  row.value.slice(0, el.selectionStart ?? row.value.length) +
                  first +
                  row.value.slice(el.selectionEnd ?? row.value.length);
                const updated = rows.map((r, i) => (i === index ? { ...r, value: merged } : r));
                const added = rest.map(makeRow);
                commit([...updated.slice(0, index + 1), ...added, ...updated.slice(index + 1)]);
                setFocusKey((added[added.length - 1] ?? row).key);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move option up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => move(index, 1)}
              disabled={index === rows.length - 1}
              aria-label="Move option down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => remove(index)}
              aria-label="Remove option"
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>
      {dupes.size > 0 && (
        <p className="text-sm text-destructive">Each option must be unique.</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => insertAfter(rows.length - 1)}>
          <Plus className="mr-2 h-4 w-4" />
          Add option
        </Button>
        <span className="text-xs text-muted-foreground">Enter adds an option · Backspace on an empty one removes it</span>
      </div>
    </div>
  );
}
