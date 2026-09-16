import { useState } from 'react';
import { FormField, FieldType, generateFieldId, defaultFieldTemplates, fieldTypeLabels } from '@/types/formFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Edit2, Trash2, Plus } from 'lucide-react';
import { OptionsEditor } from './OptionsEditor';
import { duplicateOptionIndexes, normalizeOptions } from '@/lib/fieldOptions';

interface FormFieldEditorProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export function FormFieldEditor({ fields, onChange }: FormFieldEditorProps) {
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [fieldFormData, setFieldFormData] = useState<Partial<FormField>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);

  const openFieldEditor = (field: FormField) => {
    setEditingField(field);
    setFieldFormData(field.type === 'select' ? { ...field, options: normalizeOptions(field.options) } : field);
    setFieldError(null);
  };

  const handleAddField = (type: FieldType) => {
    const template = defaultFieldTemplates[type];
    const newField: FormField = {
      ...template,
      id: generateFieldId(),
      order: fields.length + 1,
    };
    openFieldEditor(newField);
    setIsAddFieldOpen(false);
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
    
    if (editingField && fields.find(f => f.id === editingField.id)) {
      // Update existing
      onChange(fields.map(f => f.id === editingField.id ? field : f));
    } else {
      // Add new
      onChange([...fields, field]);
    }
    
    setEditingField(null);
    setFieldFormData({});
    setFieldError(null);
  };

  const handleDeleteField = (fieldId: string) => {
    onChange(fields.filter(f => f.id !== fieldId).map((f, index) => ({ ...f, order: index + 1 })));
  };

  const handleMoveField = (fieldId: string, direction: 'up' | 'down') => {
    const index = fields.findIndex(f => f.id === fieldId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === fields.length - 1) return;

    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    
    // Update order numbers
    onChange(newFields.map((f, i) => ({ ...f, order: i + 1 })));
  };

  return (
    <div className="space-y-4">
      {/* Field List */}
      <div className="space-y-2">
        {fields.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No fields added yet. Click "Add Field" to get started.
          </Card>
        ) : (
          fields.map((field, index) => (
            <Card key={field.id} className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleMoveField(field.id, 'up')}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleMoveField(field.id, 'down')}
                    disabled={index === fields.length - 1}
                  >
                    ↓
                  </Button>
                </div>
                <GripVertical className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    <Badge variant="outline">{fieldTypeLabels[field.type]}</Badge>
                    {field.required && <Badge variant="secondary">Required</Badge>}
                  </div>
                  {field.placeholder && (
                    <span className="text-sm text-muted-foreground">Placeholder: {field.placeholder}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openFieldEditor(field)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Field Button */}
      <Button type="button" onClick={() => setIsAddFieldOpen(true)} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add Field
      </Button>

      {/* Field Type Selection Dialog */}
      <Dialog open={isAddFieldOpen} onOpenChange={setIsAddFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Field Type</DialogTitle>
            <DialogDescription>Choose the type of field you want to add</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(defaultFieldTemplates) as FieldType[]).map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                onClick={() => handleAddField(type)}
                className="h-auto flex-col gap-1 p-4"
              >
                <span className="text-sm font-medium">{fieldTypeLabels[type]}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Field Configuration Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="max-w-2xl">
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
              <label htmlFor="required" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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
    </div>
  );
}
