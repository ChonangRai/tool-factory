import { useState } from 'react';
import { FormField, FieldType, generateFieldId, defaultFieldTemplates, fieldTypeLabels } from '@/types/formFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Edit2, Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { OptionsEditor } from './OptionsEditor';
import { duplicateOptionIndexes, normalizeOptions } from '@/lib/fieldOptions';
import {
  generateSectionId,
  groupFieldsBySection,
  normalizeFormSettings,
  type FormSection,
  type NormalizedSettings,
} from '@/lib/formSections';

interface FormFieldEditorProps {
  settings: NormalizedSettings;
  onChange: (settings: NormalizedSettings) => void;
}

export function FormFieldEditor({ settings, onChange }: FormFieldEditorProps) {
  const [isAddFieldOpen, setIsAddFieldOpen] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [fieldFormData, setFieldFormData] = useState<Partial<FormField>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sectionToDelete, setSectionToDelete] = useState<FormSection | null>(null);

  const groups = groupFieldsBySection(settings);
  // Array position is the intent here, so order is re-stamped from it before
  // normalizing (the normalizer sorts by order, and would otherwise undo a
  // move).
  const commit = (next: { sections?: FormSection[]; fields?: FormField[] }) =>
    onChange(
      normalizeFormSettings({
        ...settings,
        ...next,
        ...(next.sections ? { sections: next.sections.map((s, i) => ({ ...s, order: i })) } : {}),
        ...(next.fields ? { fields: next.fields.map((f, i) => ({ ...f, order: i })) } : {}),
      })
    );

  // Sections -----------------------------------------------------------------

  const handleAddSection = () => {
    const section: FormSection = {
      id: generateSectionId(),
      title: '',
      order: settings.sections.length,
    };
    commit({ sections: [...settings.sections, section] });
  };

  const updateSection = (id: string, patch: Partial<FormSection>) =>
    commit({ sections: settings.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const moveSection = (id: string, delta: -1 | 1) => {
    const index = settings.sections.findIndex((s) => s.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= settings.sections.length) return;
    const sections = [...settings.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    commit({ sections: sections.map((s, i) => ({ ...s, order: i })) });
  };

  const deleteSection = (section: FormSection, mode: 'move-fields' | 'delete-fields') => {
    const remaining = settings.sections.filter((s) => s.id !== section.id);
    const index = settings.sections.findIndex((s) => s.id === section.id);
    const fallback = remaining[Math.max(0, index - 1)];
    const fields =
      mode === 'delete-fields' || !fallback
        ? settings.fields.filter((f) => f.sectionId !== section.id)
        : settings.fields.map((f) => (f.sectionId === section.id ? { ...f, sectionId: fallback.id } : f));
    commit({ sections: remaining, fields });
    setSectionToDelete(null);
  };

  // Fields -------------------------------------------------------------------

  const openFieldEditor = (field: FormField) => {
    setEditingField(field);
    setFieldFormData(field.type === 'select' ? { ...field, options: normalizeOptions(field.options) } : field);
    setFieldError(null);
  };

  const handleAddField = (type: FieldType, sectionId: string) => {
    const template = defaultFieldTemplates[type];
    openFieldEditor({ ...template, id: generateFieldId(), order: settings.fields.length, sectionId } as FormField);
    setIsAddFieldOpen(null);
  };

  const handleSaveField = () => {
    if (!fieldFormData.label?.trim() || !fieldFormData.type) {
      setFieldError('Field label is required.');
      return;
    }

    const field = { ...fieldFormData } as FormField;
    if (field.type === 'select') {
      const raw = (field.options ?? []).map((o) => o.trim());
      // The options editor already flags duplicates inline.
      if (duplicateOptionIndexes(raw).size > 0) return;
      field.options = normalizeOptions(raw);
      if (field.options.length === 0) {
        setFieldError('Add at least one option.');
        return;
      }
    } else {
      delete field.options;
    }

    const exists = settings.fields.some((f) => f.id === field.id);
    commit({
      fields: exists ? settings.fields.map((f) => (f.id === field.id ? field : f)) : [...settings.fields, field],
    });

    setEditingField(null);
    setFieldFormData({});
    setFieldError(null);
  };

  const handleDeleteField = (fieldId: string) =>
    commit({ fields: settings.fields.filter((f) => f.id !== fieldId) });

  // Reordering happens within a section; use "Section" in the field editor to
  // move a field elsewhere (keyboard-friendly, and no cross-list dragging).
  const moveField = (field: FormField, delta: -1 | 1) => {
    const siblings = settings.fields.filter((f) => f.sectionId === field.sectionId);
    const index = siblings.findIndex((f) => f.id === field.id);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // Rebuild in section order so normalizeFormSettings keeps the new order.
    const bySection = new Map(groups.map((g) => [g.section.id, g.fields]));
    bySection.set(field.sectionId ?? settings.sections[0].id, reordered);
    commit({ fields: settings.sections.flatMap((s) => bySection.get(s.id) ?? []) });
  };

  return (
    <div className="space-y-4">
      {groups.map(({ section, fields }, sectionIndex) => {
        const isCollapsed = collapsed[section.id] === true;
        return (
          <Card key={section.id} className="overflow-hidden">
            <div className="flex items-start gap-2 border-b bg-muted/30 p-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-7 w-7 shrink-0 p-0"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                onClick={() => setCollapsed((prev) => ({ ...prev, [section.id]: !isCollapsed }))}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  placeholder={`Section ${sectionIndex + 1} title (optional)`}
                  aria-label={`Section ${sectionIndex + 1} title`}
                  className="h-9 font-medium"
                />
                {section.description !== undefined ? (
                  <Textarea
                    value={section.description}
                    onChange={(e) => updateSection(section.id, { description: e.target.value })}
                    placeholder="Short description shown above this section"
                    aria-label={`Section ${sectionIndex + 1} description`}
                    rows={2}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => updateSection(section.id, { description: '' })}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add description
                  </Button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
                  {fields.length} field{fields.length === 1 ? '' : 's'}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => moveSection(section.id, -1)} disabled={sectionIndex === 0}
                  aria-label="Move section up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => moveSection(section.id, 1)} disabled={sectionIndex === groups.length - 1}
                  aria-label="Move section down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                  onClick={() => setSectionToDelete(section)} disabled={groups.length === 1}
                  aria-label="Delete section">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="space-y-2 p-3">
                {fields.map((field, fieldIndex) => (
                  <div key={field.id} className="flex items-center gap-2 rounded-md border p-2">
                    <div className="flex flex-col">
                      <Button type="button" variant="ghost" size="sm" className="h-5 w-6 p-0"
                        onClick={() => moveField(field, -1)} disabled={fieldIndex === 0} aria-label="Move field up">
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-5 w-6 p-0"
                        onClick={() => moveField(field, 1)} disabled={fieldIndex === fields.length - 1}
                        aria-label="Move field down">
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{field.label}</span>
                        <Badge variant="outline">{fieldTypeLabels[field.type]}</Badge>
                        {field.required && <Badge variant="secondary">Required</Badge>}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openFieldEditor(field)}
                      aria-label={`Edit ${field.label}`}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteField(field.id)}
                      aria-label={`Delete ${field.label}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No fields in this section yet.</p>
                )}
                <Button type="button" variant="outline" size="sm" className="w-full"
                  onClick={() => setIsAddFieldOpen(section.id)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add field
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <Button type="button" variant="outline" onClick={handleAddSection} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add section
      </Button>

      {/* Field type picker */}
      <Dialog open={isAddFieldOpen !== null} onOpenChange={(open) => !open && setIsAddFieldOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Field Type</DialogTitle>
            <DialogDescription>Choose the type of field you want to add</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(defaultFieldTemplates) as FieldType[]).map((type) => (
              <Button key={type} type="button" variant="outline" className="h-auto flex-col gap-1 p-4"
                onClick={() => handleAddField(type, isAddFieldOpen!)}>
                <span className="text-sm font-medium">{fieldTypeLabels[type]}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Field configuration */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Field Label *</Label>
              <Input
                value={fieldFormData.label || ''}
                onChange={(e) => setFieldFormData({ ...fieldFormData, label: e.target.value })}
                placeholder="e.g., Product Name"
              />
            </div>

            <div className="grid gap-2">
              <Label>Field Type</Label>
              <Select
                value={fieldFormData.type}
                onValueChange={(value) => setFieldFormData({ ...fieldFormData, type: value as FieldType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(fieldTypeLabels) as FieldType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {fieldTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {settings.sections.length > 1 && (
              <div className="grid gap-2">
                <Label>Section</Label>
                <Select
                  value={fieldFormData.sectionId}
                  onValueChange={(value) => setFieldFormData({ ...fieldFormData, sectionId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.sections.map((s, i) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title.trim() || `Section ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Placeholder</Label>
              <Input
                value={fieldFormData.placeholder || ''}
                onChange={(e) => setFieldFormData({ ...fieldFormData, placeholder: e.target.value })}
                placeholder="e.g., Enter product name..."
              />
            </div>

            {fieldFormData.type === 'select' && (
              <div className="grid gap-2">
                <Label>Options</Label>
                <OptionsEditor
                  key={editingField?.id}
                  value={normalizeOptions(fieldFormData.options)}
                  onChange={(options) => {
                    setFieldFormData((prev) => ({ ...prev, options }));
                    setFieldError(null);
                  }}
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                checked={fieldFormData.required || false}
                onCheckedChange={(checked) => setFieldFormData({ ...fieldFormData, required: !!checked })}
                id="required"
              />
              <label htmlFor="required" className="text-sm font-medium leading-none">
                Required field
              </label>
            </div>
          </div>
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
            <Button type="button" onClick={handleSaveField}>Save Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section deletion */}
      <AlertDialog open={!!sectionToDelete} onOpenChange={(open) => !open && setSectionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete section</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const count = settings.fields.filter((f) => f.sectionId === sectionToDelete?.id).length;
                return count === 0
                  ? 'This section has no fields and will be removed.'
                  : `This section has ${count} field${count === 1 ? '' : 's'}. Keep them by moving them into the previous section, or delete them with the section.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" variant="outline"
              onClick={() => sectionToDelete && deleteSection(sectionToDelete, 'move-fields')}>
              Move fields and delete section
            </Button>
            <Button type="button" variant="destructive"
              onClick={() => sectionToDelete && deleteSection(sectionToDelete, 'delete-fields')}>
              Delete section and fields
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
