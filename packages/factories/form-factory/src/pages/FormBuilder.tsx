
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Layout, Eye } from 'lucide-react';
import { FormFieldEditor } from '@/components/FormFieldEditor';
import { SectionedForm } from '@/components/SectionedForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  normalizeFormSettings,
  toStoredSettings,
  type NormalizedSettings,
} from '@/lib/formSections';

type FormSettings = ReturnType<typeof toStoredSettings>;

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
  const [settings, setSettings] = useState<NormalizedSettings>(() => normalizeFormSettings(null));
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
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
        // One normalizer for every consumer: a pre-sections form arrives here
        // as a single unnamed section and is only rewritten when saved.
        setSettings(normalizeFormSettings(data.settings));
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
    if (settings.fields.length === 0) {
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
            settings: toStoredSettings(settings) as any,
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
          settings: toStoredSettings(settings),
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
          <Button variant="outline" onClick={() => setIsPreviewOpen(true)} disabled={settings.fields.length === 0}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
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
                {settings.sections.length} section{settings.sections.length !== 1 ? 's' : ''} ·{' '}
                {settings.fields.length} field{settings.fields.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Group questions into sections. Submitters answer one section at a time, then review
                everything before submitting.
              </div>

              <div className="mt-4 flex items-start gap-2 border-t pt-4">
                <Checkbox
                  id="save-progress"
                  checked={settings.saveProgress}
                  onCheckedChange={(checked) => setSettings({ ...settings, saveProgress: !!checked })}
                />
                <div className="grid gap-1">
                  <Label htmlFor="save-progress" className="cursor-pointer text-sm font-medium">
                    Save progress on this device
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Lets submitters come back to unfinished answers for 24 hours, kept in their own
                    browser. Turn off for sensitive forms or shared computers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editor Area (Right Column) */}
        <div className="md:col-span-3">
          <FormFieldEditor settings={settings} onChange={setSettings} />
        </div>
      </div>

      {/* Preview uses the same renderer as the public form -- no second model. */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formName || 'Form preview'}</DialogTitle>
            <DialogDescription>
              This is how submitters will move through the form. Nothing is submitted from here.
            </DialogDescription>
          </DialogHeader>
          <SectionedForm
            settings={settings}
            onSubmit={() => toast.info('Preview only — nothing was submitted')}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
