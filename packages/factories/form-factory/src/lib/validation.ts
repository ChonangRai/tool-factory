import { z } from "zod";

// File validation constants
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
];

export const submissionSchema = z.object({
  name: z.string()
    .trim()
    .max(100, { message: "Name must be less than 100 characters" })
    .optional(),
  
  contact_number: z.string()
    .trim()
    .max(20, { message: "Contact number must be less than 20 characters" })
    .regex(/^[0-9+\-\s()]*$/, { message: "Invalid contact number format" })
    .optional(),
  
  email: z.string()
    .trim()
    .email({ message: "Invalid email address" })
    .max(255, { message: "Email must be less than 255 characters" })
    .optional(),
  
  date: z.string()
    .optional(),
  
  description: z.string()
    .trim()
    .max(1000, { message: "Description must be less than 1000 characters" })
    .optional(),
  
  amount: z.union([z.string(), z.number()])
    .transform((val) => {
      if (typeof val === 'number') return val;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : parsed;
    })
    .optional(),
});

export type SubmissionFormData = z.infer<typeof submissionSchema>;

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { valid: false, error: `File type must be one of: ${ALLOWED_FILE_TYPES.join(', ')}` };
  }

  return { valid: true };
}
