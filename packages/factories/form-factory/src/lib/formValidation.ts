import type { FormField } from '@/types/formFields';

// Shared by the step renderer and the final submit check, so a section is
// validated by exactly the same rules whichever way the submitter got there.
export function validateFields(
  fields: FormField[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.id];

    if (field.required && (value === undefined || value === null || value === '' || value === false)) {
      errors[field.id] = `${field.label} is required`;
      continue;
    }

    if (field.type === 'email' && typeof value === 'string' && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors[field.id] = 'Please enter a valid email address';
      }
    }

    if (field.type === 'phone' && typeof value === 'string' && value) {
      if (!/^[\d\s\-+()]+$/.test(value)) {
        errors[field.id] = 'Please enter a valid phone number';
      }
    }
  }

  return errors;
}
