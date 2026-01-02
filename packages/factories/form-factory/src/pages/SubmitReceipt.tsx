import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Receipt, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DynamicForm } from '@/components/DynamicForm';
import { FormField } from '@/types/formFields';
import { storage } from '@/lib/storage';
import { processReceiptImage } from '@/utils/ocr';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SubmitReceipt() {
  const { formId } = useParams();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [loadingForm, setLoadingForm] = useState(true);
  const [sendReceipt, setSendReceipt] = useState(false); // Default false for opt-in
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [validatingImage, setValidatingImage] = useState(false);
  
  // State for low quality warning dialog
  const [showQualityWarning, setShowQualityWarning] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (formId) {
      loadForm();
    }
  }, [formId]);

  const loadForm = async () => {
    try {
      // Use RPC to fetch public form securely
      // Cast to any because types are not yet generated for the new RPC
      const { data, error } = await (supabase as any)
        .rpc('get_public_form', { form_id: formId });

      if (error) throw error;
      if (!data) throw new Error('Form not found');
      
      setForm(data);
      
      // Extract fields from settings
      const formData = data as any;
      if (formData.settings && typeof formData.settings === 'object' && 'fields' in formData.settings) {
        setFormFields((formData.settings as any).fields || []);
      }
    } catch (error) {
      console.error('Error loading form:', error);
      toast.error('Form not found or invalid link');
    } finally {
      setLoadingForm(false);
    }
  };

  const validateImageQuality = async (file: File): Promise<boolean> => {
    setValidatingImage(true);
    try {
      toast.info('Verifying image readability...');
      const result = await processReceiptImage(file);
      
      // Validation criteria:
      // 1. Confidence score > 60
      // 2. Extracted text length > 10 chars (not empty)
      
      if (result.confidence < 60) {
        toast.warning('Image quality is low. Please ensure text is readable.');
        return false;
      }
      
      if (result.text.length < 10) {
        toast.warning('Could not read text from image. Please try a clearer photo.');
        return false;
      }

      toast.success('Image quality verified!');
      return true;
    } catch (error) {
      console.error('Validation error:', error);
      // Don't block submission on OCR error, just warn
      toast.warning('Could not verify image quality. Proceeding anyway.');
      return true;
    } finally {
      setValidatingImage(false);
    }
  };

  const processSubmission = async (formData: Record<string, any>) => {
    setLoading(true);
    try {
      if (!formId) {
        toast.error('Invalid form link');
        return;
      }

      // Handle file uploads
      const fileFields = formFields.filter(f => f.type === 'file');
      const uploadedFiles: any[] = [];

      for (const field of fileFields) {
        const file = formData[field.id];
        if (file instanceof File) {
          // Upload file to storage
          const filePath = `${formId}/${Date.now()}_${file.name}`;
          const uploadResult = await storage.uploadFile(file, filePath);
          
          uploadedFiles.push({
            filename: file.name,
            path: uploadResult.path,
            mime: file.type,
            size: file.size,
          });

          // Replace file object with path in formData
          formData[field.id] = uploadResult.path;
        }
      }

      // Use Secure RPC to submit form and link files in one go
      // This bypasses RLS issues for public users
      const { data: submissionId, error: submissionError } = await (supabase as any).rpc('submit_form', {
        p_form_id: formId,
        p_data: formData,
        p_files: uploadedFiles
      });

      if (submissionError) throw submissionError;

      // Trigger email notification (non-blocking) - IF OPTED IN
      if (sendReceipt) {
        supabase.functions.invoke('submit-receipt', {
          body: { submission_id: submissionId }
        }).then(({ error }) => {
          if (error) console.error('Failed to trigger email notification:', error);
        });
      }

      setSubmitted(true);
      toast.success('Submission successful!');
    } catch (error: any) {
      console.error('Submission error:', error);
      toast.error(error.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: Record<string, any>) => {
    // Check for files and validate quality
    const fileFields = formFields.filter(f => f.type === 'file');
    let qualityIssue = false;

    for (const field of fileFields) {
      const file = formData[field.id];
      if (file instanceof File) {
        const isValid = await validateImageQuality(file);
        if (!isValid) {
          qualityIssue = true;
        }
      }
    }

    if (qualityIssue) {
      setPendingSubmission(formData);
      setShowQualityWarning(true);
    } else {
      await processSubmission(formData);
    }
  };

  const handleConfirmLowQuality = () => {
    setShowQualityWarning(false);
    if (pendingSubmission) {
      processSubmission(pendingSubmission);
    }
  };

  if (loadingForm) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Form Not Found</CardTitle>
            <CardDescription>
              The link you used is invalid or the form has been deleted.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle p-4">
        <Card className="w-full max-w-md text-center shadow-elevated">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success">
              <CheckCircle2 className="h-8 w-8 text-success-foreground" />
            </div>
            <CardTitle className="text-2xl">Submission Successful!</CardTitle>
            <CardDescription>
              Your submission has been received and is now under review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setSubmitted(false)} className="w-full">
              Submit Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
            <Receipt className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">{form.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Please fill in all required fields
          </p>
        </div>

        {validatingImage && (
          <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10">
            <CardContent className="flex items-center gap-4 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Verifying image readability...
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          <DynamicForm
            fields={formFields}
            onSubmit={handleSubmit}
            isSubmitting={loading || validatingImage}
          >
            <div className="flex items-center space-x-2 p-2">
              <Checkbox 
                id="send-receipt" 
                checked={sendReceipt}
                onCheckedChange={(checked) => setSendReceipt(checked as boolean)}
              />
              <Label 
                htmlFor="send-receipt" 
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Send me a confirmation email with my receipt
              </Label>
            </div>
          </DynamicForm>
        </div>

        <AlertDialog open={showQualityWarning} onOpenChange={setShowQualityWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="h-5 w-5" />
                Low Image Quality
              </AlertDialogTitle>
              <AlertDialogDescription>
                The receipt image you uploaded seems to be blurry or hard to read. 
                This might delay the processing of your submission.
                <br /><br />
                Do you want to proceed anyway, or cancel to upload a better photo?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingSubmission(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLowQuality}>Proceed Anyway</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
