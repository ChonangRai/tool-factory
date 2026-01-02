import { useState, useEffect } from 'react';
import { FormField } from '@/types/formFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DynamicFieldProps {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

export function DynamicField({ field, value, onChange, error }: DynamicFieldProps) {
  const renderField = () => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <Input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            rows={4}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        );

      case 'select':
        return (
          <Select value={value || ''} onValueChange={onChange} required={field.required}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option, index) => (
                <SelectItem key={index} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={value || false}
              onCheckedChange={onChange}
              required={field.required}
            />
            <span className="text-sm">{field.placeholder || 'Check to confirm'}</span>
          </div>
        );

      case 'file':
        const [previewUrl, setPreviewUrl] = useState<string | null>(null);

        // Cleanup preview URL on unmount or change
        useEffect(() => {
          return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
          };
        }, [previewUrl]);

        const handleFileChange = (file: File | undefined) => {
          onChange(file);
          
          if (file && file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
          } else {
            setPreviewUrl(null);
          }
        };

        return (
          <div className="space-y-4">
            {previewUrl && (
              <div className="relative rounded-lg overflow-hidden border w-full max-w-sm mx-auto">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full h-auto object-contain bg-muted/20"
                />
              </div>
            )}
            <Input
              type="file"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              required={field.required}
              accept="image/*,application/pdf"
            />
            {value && !previewUrl && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="font-medium">Selected:</span> {value.name}
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {renderField()}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
