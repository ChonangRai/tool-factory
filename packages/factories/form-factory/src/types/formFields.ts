// Form Field Types for Custom Form Builder

export type FieldType = 
  | 'text' 
  | 'number' 
  | 'email' 
  | 'phone' 
  | 'textarea'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'file';

export interface FormField {
  id: string;              // Unique field ID (e.g., "field_1")
  label: string;           // Display label (e.g., "Product Name")
  type: FieldType;         // Field type
  required: boolean;       // Validation
  order: number;           // Display order
  options?: string[];      // Select choices: distinct, trimmed labels (see lib/fieldOptions)
  placeholder?: string;    // Input placeholder
  defaultValue?: string | number | boolean;  // Default value
  sectionId?: string;      // Owning section (see lib/formSections)
}

export interface FormSettings {
  version?: number;
  sections?: { id: string; title: string; description?: string; order: number }[];
  fields: FormField[];
}

// Helper function to generate unique field ID
export const generateFieldId = (): string => {
  return `field_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

// Default field templates
export const defaultFieldTemplates: Record<FieldType, Omit<FormField, 'id' | 'order'>> = {
  text: {
    label: 'Text Field',
    type: 'text',
    required: false,
    placeholder: 'Enter text...',
  },
  number: {
    label: 'Number Field',
    type: 'number',
    required: false,
    placeholder: '0',
  },
  email: {
    label: 'Email',
    type: 'email',
    required: false,
    placeholder: 'email@example.com',
  },
  phone: {
    label: 'Phone Number',
    type: 'phone',
    required: false,
    placeholder: '+1 (555) 000-0000',
  },
  textarea: {
    label: 'Text Area',
    type: 'textarea',
    required: false,
    placeholder: 'Enter detailed text...',
  },
  date: {
    label: 'Date',
    type: 'date',
    required: false,
  },
  select: {
    label: 'Dropdown',
    type: 'select',
    required: false,
    options: [],
  },
  checkbox: {
    label: 'Checkbox',
    type: 'checkbox',
    required: false,
  },
  file: {
    label: 'File Upload',
    type: 'file',
    required: false,
  },
};

// Field type display names
export const fieldTypeLabels: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  textarea: 'Text Area',
  date: 'Date',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  file: 'File Upload',
};

// Validation helper
export const validateFormField = (field: FormField): string | null => {
  if (!field.label.trim()) {
    return 'Label is required';
  }
  if (field.type === 'select' && (!field.options || field.options.length === 0)) {
    return 'Dropdown must have at least one option';
  }
  return null;
};
