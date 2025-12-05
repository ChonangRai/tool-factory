import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2,
  Download,
  Search,
  Filter,
  Eye,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { storage } from '@/lib/storage';

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

export default function AllSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const formId = searchParams.get('form_id');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null);

  // Receipt preview state
  const [previewReceipt, setPreviewReceipt] = useState<{ url: string; filename: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    loadForms();
    loadSubmissions();
  }, [formId]);

  const loadForms = async () => {
    const { data } = await supabase.from('forms').select('id, name').order('name');
    if (data) setForms(data);
  };

  const loadSubmissions = async () => {
    try {
      let query = supabase
        .from('submissions')
        .select(`
          *,
          files (id, filename, path, mime),
          forms (name)
        `)
        .is('deleted_at', null);
      
      // Filter by form_id if provided
      if (formId) {
        query = query.eq('form_id', formId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Store the form name if filtering by form
      if (data && data.length > 0 && formId) {
        setSelectedFormName(data[0].forms?.name || null);
      }

      setSubmissions(data as unknown as Submission[] || []);
    } catch (error: any) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (submission_id: string, new_status: string) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: new_status })
        .eq('id', submission_id);

      if (error) throw error;

      toast.success('Status updated successfully');
      loadSubmissions();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleArchiveSubmission = async (submissionId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('submissions')
        .update({ 
          deleted_at: new Date().toISOString()
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast.success('Submission archived');
      loadSubmissions();
    } catch (error: any) {
      console.error('Error archiving submission:', error);
      toast.error('Failed to archive submission');
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
      const url = await storage.getDownloadUrl(file.path, 3600);
      setPreviewReceipt({ url, filename: file.filename });
    } catch (error: any) {
      console.error('Error loading receipt:', error);
      toast.error('Failed to load attachment');
    } finally {
      setLoadingPreview(false);
    }
  };

  const filteredSubmissions = submissions.filter((submission) => {
    const matchesSearch =
      (submission.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (submission.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (submission.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || submission.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {selectedFormName ? `${selectedFormName} Submissions` : 'All Submissions'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedFormName
              ? `Viewing submissions for ${selectedFormName}`
              : 'View and manage all form submissions'}
          </p>
        </div>
        {selectedFormName && (
          <Button variant="outline" asChild>
            <Link to="/dashboard/submissions">View All Submissions</Link>
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select 
              value={formId || 'all'} 
              onValueChange={(value) => {
                const newParams = new URLSearchParams(searchParams);
                if (value === 'all') {
                  newParams.delete('form_id');
                  setSelectedFormName(null);
                } else {
                  newParams.set('form_id', value);
                }
                setSearchParams(newParams);
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by Form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms</SelectItem>
                {forms.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardDescription>
                {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Date of Submission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attachments</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">
                      {submission.forms?.name || 'Unknown Form'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(submission.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={submission.status}
                        onValueChange={(value) => handleStatusChange(submission.id, value)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            <Badge variant="secondary">New</Badge>
                          </SelectItem>
                          <SelectItem value="reviewed">
                            <Badge variant="default">Reviewed</Badge>
                          </SelectItem>
                          <SelectItem value="paid">
                            <Badge className="bg-success">Paid</Badge>
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReceipt(submission.files[0])}
                          disabled={!submission.files || submission.files.length === 0}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchiveSubmission(submission.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewReceipt} onOpenChange={() => setPreviewReceipt(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewReceipt?.filename || 'Attachment'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {previewReceipt && (
              <img 
                src={previewReceipt.url} 
                alt={previewReceipt.filename}
                className="w-full h-auto object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
