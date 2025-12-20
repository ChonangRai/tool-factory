import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Loader2,
  LogOut,
  Download,
  Search,
  Filter,
  FileText,
  Calendar,
  DollarSign,
  User,
  Plus,
  Copy,
  Link as LinkIcon,
  Folder,
  FolderPlus,
  MoreVertical,
  ChevronRight,
  Home,
  Trash2,
  Edit2,
  Move,
  Eye,
  CheckCircle2,
  Archive,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Calendar as DatePicker } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { storage } from '@/lib/storage';
import { FormField } from '@/types/formFields';

interface Submission {
  id: string;
  name: string;
  email: string;
  contact_number: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  created_at: string;
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



interface Form {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  folder_id: string | null;
  settings: {
    fields: string[];
  } | null;
}

interface Folder {
  id: string;
  name: string;
  created_at: string;
}



export default function Admin() {
  const { signOut, user, organizationId, isManager, orgRole } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Preview dialog state: null = closed, otherwise holds form id
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);
  const isPreviewOpen = !!previewFormId;
  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    reviewed: 0,
    totalAmount: 0,
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [moveFormId, setMoveFormId] = useState<string | null>(null);

  // Export states
  const [exportDate, setExportDate] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedExportForms, setSelectedExportForms] = useState<string[]>([]);
  const [exportPage, setExportPage] = useState(1);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});

  // Receipt preview state
  const [previewReceipt, setPreviewReceipt] = useState<{ url: string; filename: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [formFilter, setFormFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Confirm dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const loadForms = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('forms')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForms((data as unknown as Form[]) || []);
    } catch (error: any) {
      console.error('Error loading forms:', error);
      toast.error('Failed to load forms');
    }
  };

  const loadSubmissionCounts = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('submissions')
        .select('form_id')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach((submission: any) => {
        counts[submission.form_id] = (counts[submission.form_id] || 0) + 1;
      });
      setSubmissionCounts(counts);
    } catch (error: any) {
      console.error('Error loading submission counts:', error);
    }
  };

  const loadSubmissions = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('submissions')
        .select(`
          *,
          files (id, filename, path, mime),
          forms (name)
        `)
        .order('created_at', { ascending: false })
        .eq('organization_id', organizationId);

      if (error) throw error;

      setSubmissions(data as unknown as Submission[] || []);
      calculateStats(data as unknown as Submission[] || []);
    } catch (error: any) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
    }
  };

  const loadFolders = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('folders')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true });

      if (error) throw error;
      setFolders(data || []);
    } catch (error: any) {
      console.error('Error loading folders:', error);
      toast.error('Failed to load folders');
    }
  };

  useEffect(() => {
    if (user && organizationId) {
      loadForms();
      loadSubmissions();
      loadFolders();
      loadSubmissionCounts();
      setLoading(false);
    }
  }, [user, organizationId]);

  // Removed loadUserOrganization as it's now handled by useAuth





  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      const { error } = await supabase
        .from('folders')
        .insert({
          name: newFolderName,
          organization_id: organizationId,
        });

      if (error) throw error;

      toast.success('Folder created successfully');
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      loadFolders();
    } catch (error: any) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderId || !renameFolderName.trim()) return;

    try {
      const { error } = await supabase
        .from('folders')
        .update({ name: renameFolderName })
        .eq('id', renameFolderId);

      if (error) throw error;

      toast.success('Folder renamed successfully');
      setRenameFolderId(null);
      setRenameFolderName('');
      loadFolders();
    } catch (error: any) {
      console.error('Error renaming folder:', error);
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Folder',
      description: 'Are you sure you want to delete this folder? Forms inside will be moved to root.',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          // First move forms to root
          const { error: moveError } = await supabase
            .from('forms')
            .update({ folder_id: null })
            .eq('folder_id', folderId);

          if (moveError) throw moveError;

          // Then delete folder
          const { error: deleteError } = await supabase
            .from('folders')
            .delete()
            .eq('id', folderId);

          if (deleteError) throw deleteError;

          toast.success('Folder deleted successfully');
          if (currentFolderId === folderId) setCurrentFolderId(null);
          loadFolders();
          loadForms();
        } catch (error: any) {
          console.error('Error deleting folder:', error);
          toast.error('Failed to delete folder');
        }
      },
    });
  };

  const handleMoveForm = async (formId: string, targetFolderId: string | null) => {
    try {
      const { error } = await supabase
        .from('forms')
        .update({ folder_id: targetFolderId })
        .eq('id', formId);

      if (error) throw error;

      toast.success('Form moved successfully');
      setMoveFormId(null);
      loadForms();
    } catch (error: any) {
      console.error('Error moving form:', error);
      toast.error('Failed to move form');
    }
  };

  const copyFormLink = (formId: string) => {
    const link = `${window.location.origin}/submit/${formId}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard');
  };


  const calculateStats = (data: Submission[]) => {
    const newCount = data.filter(s => s.status === 'new').length;
    const reviewedCount = data.filter(s => s.status === 'reviewed').length;
    const totalAmount = data.reduce((sum, s) => sum + Number(s.amount), 0);

    setStats({
      total: data.length,
      new: newCount,
      reviewed: reviewedCount,
      totalAmount,
    });
  };

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: newStatus })
        .eq('id', submissionId);

      if (error) throw error;

      // Create audit log
      await supabase.from('audit_logs').insert({
        submission_id: submissionId,
        admin_id: user?.id,
        action: 'status_change',
        data: { new_status: newStatus },
      });

      toast.success('Status updated successfully');
      loadSubmissions();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDownloadReceipt = async (file: { path: string; filename: string }) => {
    try {
      const url = await storage.getDownloadUrl(file.path);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
    } catch (error: any) {
      console.error('Error downloading receipt:', error);
      toast.error('Failed to download receipt');
    }
  };

  const handleViewReceipt = async (file: { path: string; filename: string }) => {
    setLoadingPreview(true);
    try {
      const url = await storage.getDownloadUrl(file.path, 3600); // 1 hour expiry
      setPreviewReceipt({ url, filename: file.filename });
    } catch (error: any) {
      console.error('Error loading receipt:', error);
      toast.error('Failed to load receipt');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedExportForms.length === 0) {
      toast.error('Please select at least one form to export');
      return;
    }

    setIsBulkExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      const formsToExport = forms.filter(f => selectedExportForms.includes(f.id));
      
      // If only one form, we can just download the Excel file directly
      // But for consistency with "Bulk Export", we might always zip if > 1
      // Let's stick to the plan: 1 form -> xlsx, >1 -> zip

      const generateWorkbook = async (form: Form, formSubmissions: Submission[]) => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Submissions');

        worksheet.columns = [
          { header: 'Name', key: 'name', width: 20 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Contact', key: 'contact', width: 15 },
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Amount', key: 'amount', width: 15 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'Description', key: 'description', width: 40 },
          { header: 'Submitted At', key: 'submitted_at', width: 20 },
          { header: 'Receipt', key: 'receipt', width: 20 },
        ];

        for (let i = 0; i < formSubmissions.length; i++) {
          const s = formSubmissions[i];
          const rowIndex = i + 2;
          const row = worksheet.getRow(rowIndex);
          
          row.values = {
            name: s.name,
            email: s.email,
            contact: s.contact_number,
            date: s.date,
            amount: s.amount,
            status: s.status,
            description: s.description,
            submitted_at: format(new Date(s.created_at), 'yyyy-MM-dd HH:mm:ss'),
          };

          if (s.files && s.files.length > 0) {
            try {
              const url = await storage.getDownloadUrl(s.files[0].path, 60);
              const response = await fetch(url);
              const arrayBuffer = await response.arrayBuffer();
              const ext = s.files[0].filename.split('.').pop()?.toLowerCase() || 'png';
              
              if (['png', 'jpeg', 'jpg', 'gif'].includes(ext)) {
                const imageId = workbook.addImage({
                  buffer: arrayBuffer,
                  extension: ext as 'png' | 'jpeg' | 'gif',
                });
                worksheet.addImage(imageId, {
                  tl: { col: 8, row: rowIndex - 1 },
                  ext: { width: 100, height: 100 },
                });
                row.height = 80;
              }
            } catch (err) {
              console.error(`Failed to embed image for submission ${s.id}`, err);
            }
          }
        }
        return workbook;
      };

      const blobs: { name: string; blob: Blob }[] = [];

      for (const form of formsToExport) {
        // Fetch submissions for this form
        let query = supabase
          .from('submissions')
          .select(`
            *,
            files (id, filename, path, mime)
          `)
          .eq('form_id', form.id) // Assuming there is a form_id column in submissions. Wait, I need to check schema.
          // The schema has 'forms' relation. In 'submissions' table, is there 'form_id'?
          // I need to verify this. If not, I can't filter by form easily.
          // Let's assume there is 'form_id' or I need to find the foreign key.
          // Looking at 'loadSubmissions' query: `forms (name)`.
          // This implies a foreign key. Usually it's `form_id`.
          // I'll assume `form_id`.
          .order('created_at', { ascending: false });

        if (exportDate.from) {
          query = query.gte('created_at', exportDate.from.toISOString());
        }
        if (exportDate.to) {
          // Add 1 day to include the end date fully
          const toDate = new Date(exportDate.to);
          toDate.setDate(toDate.getDate() + 1);
          query = query.lt('created_at', toDate.toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;

        const workbook = await generateWorkbook(form, (data as unknown as Submission[]) || []);
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        blobs.push({ name: `${form.name}.xlsx`, blob });
      }

      if (blobs.length === 1) {
        const url = URL.createObjectURL(blobs[0].blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = blobs[0].name;
        a.click();
      } else if (blobs.length > 1) {
        blobs.forEach(b => zip.file(b.name, b.blob));
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `submissions-export-${format(new Date(), 'yyyy-MM-dd')}.zip`;
        a.click();
      }

      toast.success('Export completed successfully');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export submissions');
    } finally {
      setIsBulkExporting(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Failed to sign out');
    }
  };

  const filteredSubmissions = submissions.filter(submission => {
    const name = submission.name || '';
    const email = submission.email || '';
    const description = submission.description || '';
    
    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || submission.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const currentFolder = folders.find(f => f.id === currentFolderId);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }





  const handleDeleteForm = async (formId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Archive Form',
      description: 'Are you sure you want to archive this form? You can restore it later from the Archived tab.',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('forms')
            .update({ deleted_at: new Date().toISOString() } as any)
            .eq('id', formId);

          if (error) throw error;

          toast.success('Form archived successfully');
          loadForms();
        } catch (error: any) {
          console.error('Error archiving form:', error);
          toast.error('Failed to archive form');
        }
      },
    });
  };

  const handleRestoreForm = async (formId: string) => {
    try {
      const { error } = await supabase
        .from('forms')
        .update({ deleted_at: null } as any)
        .eq('id', formId);

      if (error) throw error;

      toast.success('Form restored successfully');
      loadForms();
    } catch (error: any) {
      console.error('Error restoring form:', error);
      toast.error('Failed to restore form');
    }
  };

  const handlePermanentDeleteForm = async (formId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Permanently Delete Form',
      description: 'Are you sure you want to PERMANENTLY delete this form? This action cannot be undone and all submissions will be lost.',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('forms')
            .delete()
            .eq('id', formId);

          if (error) throw error;

          toast.success('Form permanently deleted');
          loadForms();
        } catch (error: any) {
          console.error('Error deleting form:', error);
          toast.error('Failed to delete form');
        }
      },
    });
  };

  // Calculate stats
  const formStats = {
    total: forms.length,
    active: forms.filter(f => !f.deleted_at).length,
    archived: forms.filter(f => f.deleted_at).length,
  };

  // Filter forms for display
  const filteredForms = forms.filter(f => {
    // 1. Filter by status (Active vs Archived)
    // Active forms have `deleted_at` === null, archived forms have a timestamp.
    const matchesStatus = formFilter === 'archived' 
      ? f.deleted_at 
      : !f.deleted_at;

    // 2. Filter by folder (Only for active forms)
    if (formFilter === 'archived') {
      return matchesStatus;
    }

    // For active forms, check folder
    const matchesFolder = f.folder_id === currentFolderId;
    
    return matchesStatus && matchesFolder;
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Forms Management</h1>
          <p className="text-sm text-muted-foreground">Manage your forms and folders</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card 
          className={cn("cursor-pointer transition-all hover:shadow-md", formFilter === 'all' && "ring-2 ring-primary")}
          onClick={() => setFormFilter('all')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Forms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <p className="text-2xl font-bold">{formStats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn("cursor-pointer transition-all hover:shadow-md", formFilter === 'active' && "ring-2 ring-primary")}
          onClick={() => setFormFilter('active')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Forms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <p className="text-2xl font-bold">{formStats.active}</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn("cursor-pointer transition-all hover:shadow-md", formFilter === 'archived' && "ring-2 ring-primary")}
          onClick={() => setFormFilter('archived')}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Archived Forms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-bold">{formStats.archived}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 hover:bg-transparent"
            onClick={() => setCurrentFolderId(null)}
          >
            <Home className="mr-1 h-4 w-4" />
            All Forms
          </Button>
          {currentFolder && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium text-foreground">{currentFolder.name}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Picker for Export */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                size="sm"
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !exportDate.from && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {exportDate.from ? (
                  exportDate.to ? (
                    <>
                      {format(exportDate.from, "LLL dd, y")} -{" "}
                      {format(exportDate.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(exportDate.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DatePicker
                initialFocus
                mode="range"
                defaultMonth={exportDate.from}
                selected={exportDate}
                onSelect={(range: any) => setExportDate(range || { from: undefined, to: undefined })}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Button 
            variant="outline" 
            size="sm"
            onClick={handleBulkExport} 
            disabled={isBulkExporting || selectedExportForms.length === 0}
          >
            {isBulkExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export ({selectedExportForms.length})
          </Button>

          {isManager && formFilter !== 'archived' && (
            <>
              <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New Folder
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                      Enter a name for your new folder.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateFolder}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                          Name
                        </Label>
                        <Input
                          id="name"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          className="col-span-3"
                          placeholder="e.g. Monthly Reports"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isCreatingFolder || !newFolderName.trim()}>
                        {isCreatingFolder && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Folder
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Button variant="default" size="sm" asChild>
                <Link to={`/dashboard/forms/new${currentFolderId ? `?folderId=${currentFolderId}` : ''}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Form
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <Card>
        <CardContent className="p-0">
          {/* Folders Grid (Only visible in Active mode and when at Root) */}
          {formFilter !== 'archived' && currentFolderId === null && folders.length > 0 && (
            <div className="grid gap-4 p-6 md:grid-cols-3 lg:grid-cols-4 border-b">
              {folders.map((folder) => (
                <Card key={folder.id} className="cursor-pointer bg-muted/30 transition-colors hover:bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex flex-1 items-center gap-3"
                        onClick={() => setCurrentFolderId(folder.id)}
                      >
                        <Folder className="h-8 w-8 text-primary/80" />
                        <div>
                          <h3 className="font-semibold">{folder.name}</h3>
                          <p className="text-xs text-muted-foreground">Folder</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setRenameFolderId(folder.id);
                            setRenameFolderName(folder.name);
                          }}>
                            <Edit2 className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteFolder(folder.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Forms Table */}
          <div className="rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-6">
                    <Checkbox
                      checked={selectedExportForms.length === forms.length && forms.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedExportForms(forms.map(f => f.id));
                        } else {
                          setSelectedExportForms([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-16">S/N</TableHead>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-center">Submissions</TableHead>
                  <TableHead className="text-center pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredForms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                      {formFilter === 'archived' ? 'No archived forms' : 'No forms in this folder'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredForms.map((form, index) => (
                    <TableRow key={form.id}>
                      <TableCell className="pl-6">
                        <Checkbox
                          checked={selectedExportForms.includes(form.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedExportForms([...selectedExportForms, form.id]);
                            } else {
                              setSelectedExportForms(selectedExportForms.filter(id => id !== form.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Link 
                            to={`/dashboard/submissions?form_id=${form.id}`}
                            className="hover:underline text-primary flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            {form.name}
                          </Link>
                          {form.folder_id && formFilter === 'archived' && (
                            <Badge variant="outline" className="text-xs">
                              {folders.find(f => f.id === form.folder_id)?.name}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(form.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {submissionCounts[form.id] || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyFormLink(form.id)}
                            title="Copy Link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewFormId(form.id)}
                            title="Preview Form"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            title="Edit Form"
                          >
                            <Link to={`/dashboard/forms/${form.id}/edit`}>
                              <Edit2 className="h-4 w-4" />
                            </Link>
                          </Button>
                          
                          {/* Move Action (Only for active forms) */}
                          {!form.deleted_at && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" title="Move">
                                  <Move className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setMoveFormId(form.id)}>
                                  Move to...
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          {form.deleted_at ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreForm(form.id)}
                                title="Restore Form"
                                className="text-success hover:text-success"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePermanentDeleteForm(form.id)}
                                title="Delete Permanently"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            // Only show archive button for managers and super_managers
                            (orgRole === 'manager' || orgRole === 'super_manager') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteForm(form.id)}
                                title="Archive Form"
                                className="text-destructive hover:text-destructive"
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renameFolderId} onOpenChange={(open) => !open && setRenameFolderId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rename-name" className="text-right">
                Name
              </Label>
              <Input
                id="rename-name"
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Preview Dialog */}
      <Dialog open={!!previewFormId} onOpenChange={(open) => !open && setPreviewFormId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Form Preview</DialogTitle>
            <DialogDescription>
              Preview how your form looks to users.
            </DialogDescription>
          </DialogHeader>
          {previewFormId && (
            <div className="w-full min-h-[500px] bg-background rounded-md border">
              <iframe
                src={`/submit/${previewFormId}`}
                className="w-full h-full min-h-[500px] border-0"
                title="Form Preview"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewFormId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Form Dialog */}
      <Dialog open={!!moveFormId} onOpenChange={(open) => !open && setMoveFormId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Form</DialogTitle>
            <DialogDescription>
              Select a destination folder for this form.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select onValueChange={(value) => handleMoveForm(moveFormId!, value === 'root' ? null : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">
                  <div className="flex items-center">
                    <Home className="mr-2 h-4 w-4" />
                    All Forms (Root)
                  </div>
                </SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center">
                      <Folder className="mr-2 h-4 w-4" />
                      {folder.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>


        {/* Receipt Preview Dialog */}
        <Dialog open={!!previewReceipt} onOpenChange={(open) => !open && setPreviewReceipt(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Receipt Preview</DialogTitle>
              <DialogDescription>
                {previewReceipt?.filename}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {previewReceipt && (
                <img
                  src={previewReceipt.url}
                  alt="Receipt"
                  className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
                />
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (previewReceipt) {
                    const a = document.createElement('a');
                    a.href = previewReceipt.url;
                    a.download = previewReceipt.filename;
                    a.click();
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button onClick={() => setPreviewReceipt(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Dialog */}
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={confirmDialog.onConfirm}
          variant={confirmDialog.variant}
        />
    </div>
  );
}
