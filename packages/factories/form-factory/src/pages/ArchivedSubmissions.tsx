import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2,
  RotateCcw,
  Trash2,
  Eye,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { storage } from '@/lib/storage';

interface ArchivedSubmission {
  id: string;
  created_at: string;
  deleted_at: string;
  files: Array<{
    id: string;
    filename: string;
    path: string;
    mime: string;
  }>;
  forms?: {
    name: string;
  };
}

export default function ArchivedSubmissions() {
  const { user, organizationId, orgRole } = useAuth();
  const [submissions, setSubmissions] = useState<ArchivedSubmission[]>([]);
  const [forms, setForms] = useState<any[]>([]); // Using any for now to match existing loose typing, ideally define interface
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Unified delete state
  const [itemToDelete, setItemToDelete] = useState<{ type: 'form' | 'submission', id: string } | null>(null);
  
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; filename: string } | null>(null);

  useEffect(() => {
    if (user && organizationId) {
      loadData();
    }
  }, [user, organizationId]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadArchivedSubmissions(), loadArchivedForms()]);
    setLoading(false);
  };

  const loadArchivedForms = async () => {
    try {
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (error) {
      console.error('Error loading archived forms:', error);
      toast.error('Failed to load archived forms');
    }
  };

  const loadArchivedSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          id,
          created_at,
          deleted_at,
          files (id, filename, path, mime),
          forms (name)
        `)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;

      setSubmissions(data as unknown as ArchivedSubmission[] || []);
    } catch (error: any) {
      console.error('Error loading archived submissions:', error);
      toast.error('Failed to load archived submissions');
    }
  };

  const handleRestoreForm = async (formId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('forms')
        .update({ deleted_at: null })
        .eq('id', formId);

      if (error) throw error;

      toast.success('Form restored successfully');
      loadArchivedForms();
    } catch (error) {
      console.error('Error restoring form:', error);
      toast.error('Failed to restore form');
    }
  };

  const handlePermanentDeleteForm = async (formId: string) => {
    try {
      const { error } = await supabase
        .from('forms')
        .delete()
        .eq('id', formId);

      if (error) throw error;

      toast.success('Form permanently deleted');
      setItemToDelete(null);
      loadArchivedForms();
    } catch (error) {
      console.error('Error deleting form:', error);
      toast.error('Failed to delete form');
    }
  };

  const handleRestoreSubmission = async (submissionId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('submissions')
        .update({ 
          deleted_at: null
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast.success('Submission restored successfully');
      loadArchivedSubmissions();
    } catch (error: any) {
      console.error('Error restoring submission:', error);
      toast.error('Failed to restore submission');
    }
  };

  const handlePermanentDeleteSubmission = async (submissionId: string) => {
    try {
      // 1. Get all files associated with this submission
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('path')
        .eq('submission_id', submissionId);

      if (filesError) throw filesError;

      // 2. Delete files from storage
      if (files && files.length > 0) {
        const filePaths = files.map(f => f.path);
        const { error: storageError } = await supabase.storage
          .from('form-submissions')
          .remove(filePaths);

        if (storageError) {
          console.error('Error deleting files from storage:', storageError);
          // Continue anyway - we still want to delete the database records
        }
      }

      // 3. Delete file records from database
      const { error: deleteFilesError } = await supabase
        .from('files')
        .delete()
        .eq('submission_id', submissionId);

      if (deleteFilesError) throw deleteFilesError;

      // 4. Now delete the submission
      const { error: deleteError } = await supabase
        .from('submissions')
        .delete()
        .eq('id', submissionId);

      if (deleteError) throw deleteError;

      toast.success('Submission permanently deleted');
      setItemToDelete(null);
      loadArchivedSubmissions();
    } catch (error: any) {
      console.error('Error permanently deleting submission:', error);
      toast.error('Failed to permanently delete submission: ' + error.message);
    }
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'form') {
      handlePermanentDeleteForm(itemToDelete.id);
    } else {
      handlePermanentDeleteSubmission(itemToDelete.id);
    }
  };

  const handleViewReceipt = async (file: { path: string; filename: string }) => {
    setLoadingPreview(true);
    try {
      const url = await storage.getDownloadUrl(file.path, 3600);
      setPreviewAttachment({ url, filename: file.filename });
    } catch (error: any) {
      console.error('Error loading receipt:', error);
      toast.error('Failed to load attachment');
    } finally {
      setLoadingPreview(false);
    }
  };

  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const daysPassed = differenceInDays(now, deleted);
    return Math.max(0, 7 - daysPassed);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Archived Items</h1>
        <p className="text-sm text-muted-foreground">
          Items are permanently deleted after 7 days
        </p>
      </div>

      {/* Archived Forms Section */}
      <Card>
        <CardHeader>
          <CardTitle>Archived Forms</CardTitle>
          <CardDescription>
            {forms.length} archived form{forms.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No archived forms
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Archived Date</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => {
                    const daysRemaining = getDaysRemaining(form.deleted_at);
                    return (
                      <TableRow key={form.id}>
                        <TableCell className="font-medium">
                          {form.name}
                        </TableCell>
                        <TableCell>
                          {format(new Date(form.deleted_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={daysRemaining <= 2 ? 'destructive' : 'secondary'}>
                            {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestoreForm(form.id)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                            {/* Only super_managers can permanently delete */}
                            {orgRole === 'super_manager' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToDelete({ type: 'form', id: form.id })}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Submissions Section */}
      <Card>
        <CardHeader>
          <CardTitle>Archived Submissions</CardTitle>
          <CardDescription>
            {submissions.length} archived submission{submissions.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No archived submissions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Archived Date</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead>Attachments</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => {
                    const daysRemaining = getDaysRemaining(submission.deleted_at);
                    return (
                      <TableRow key={submission.id}>
                        <TableCell className="font-medium">
                          {submission.forms?.name || 'Unknown Form'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(submission.deleted_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={daysRemaining <= 2 ? 'destructive' : 'secondary'}>
                            {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {submission.files && submission.files.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewReceipt(submission.files[0])}
                              disabled={loadingPreview}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestoreSubmission(submission.id)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                            {/* Only super_managers can permanently delete */}
                            {orgRole === 'super_manager' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setItemToDelete({ type: 'submission', id: submission.id })}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.filename || 'Attachment'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {previewAttachment && (
              <img 
                src={previewAttachment.url} 
                alt={previewAttachment.filename}
                className="w-full h-auto object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete {itemToDelete?.type === 'form' ? 'Form' : 'Submission'}</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the {itemToDelete?.type}
              {itemToDelete?.type === 'submission' ? ' and all associated files' : ''} from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
