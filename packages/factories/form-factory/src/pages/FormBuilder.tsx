
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Layout } from 'lucide-react';
import { FormFieldEditor } from '@/components/FormFieldEditor';
import { FormField } from '@/types/formFields';

interface FormSettings {
  fields: FormField[];
}

interface Form {
  id: string;
  name: string;
  slug: string;
  folder_id: string | null;
  organization_id: string;
  settings: FormSettings;
  created_by?: string;
}

export default function FormBuilder() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { user, organizationId } = useAuth();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folderId');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  
  // Track original data for edit mode
  const [originalForm, setOriginalForm] = useState<Form | null>(null);

  const isEditMode = !!formId;

  // Load form data in edit mode
  useEffect(() => {
    if (isEditMode && formId) {
      loadForm(formId);
    }
  }, [formId]);

  const loadForm = async (id: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setOriginalForm(data as any);
        setFormName(data.name);
        // Safely parse settings and fields
        const settings = data.settings as unknown as FormSettings | null;
        if (settings?.fields) {
          setFields(settings.fields);
        }
      }
    } catch (error: any) {
      console.error('Error loading form:', error);
      toast.error('Failed to load form');
      navigate('/dashboard/forms');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Form name is required');
      return;
    }
    if (fields.length === 0) {
      toast.error('Please add at least one field to the form');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditMode && formId) {
        // Update existing form
        const { error } = await supabase
          .from('forms')
          .update({
            name: formName,
            settings: {
              fields: fields as any,
            },
          })
          .eq('id', formId);

        if (error) throw error;
        toast.success('Form updated successfully');
      } else {
        // Create new form
        const slug = generateSlug(formName);
        const formData: any = {
          name: formName,
          slug: slug,
          folder_id: folderId || null,
          settings: {
            fields: fields as any,
          },
        };

        if (organizationId) {
          formData.organization_id = organizationId;
        }
        if (user?.id) {
          formData.created_by = user.id;
        }

        const { error } = await supabase
          .from('forms')
          .insert(formData);

        if (error) throw error;
        toast.success('Form created successfully');
      }

      // Navigate back to forms list
      navigate('/dashboard/forms');
    } catch (error: any) {
      console.error('Error saving form:', error);
      toast.error('Failed to save form');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard/forms');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-5xl space-y-6">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Enter Form Name"
              className="text-lg font-semibold h-12"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {isEditMode ? 'Update Form' : 'Save Form'}
          </Button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Helper / Preview Area (Left Column - optional future expansion) */}
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layout className="h-4 w-4" />
                Structure
              </CardTitle>
              <CardDescription>
                {fields.length} field{fields.length !== 1 ? 's' : ''} added
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Drag and drop fields to reorder. Configure properties using the edit button.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editor Area (Right Column) */}
        <div className="md:col-span-3">
          <FormFieldEditor fields={fields} onChange={setFields} />
        </div>
      </div>
    </div>
  );
}
