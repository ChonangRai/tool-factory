import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2,
  Download,
  FileText,
  Calendar,
  DollarSign,
  User,
  Eye,
  CheckCircle2,
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
  data?: any; // Dynamic form data
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

export default function Dashboard() {
  const { user, organizationId, organizationName } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    reviewed: 0,
  });
  
  // Receipt preview state
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; filename: string } | null>(null);

  useEffect(() => {
    if (user && organizationId) {
      loadSubmissions();
    }
  }, [user, organizationId]);

  const loadSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          files (id, filename, path, mime),
          forms (name)
        `)
        .is('deleted_at', null) // Only show non-deleted submissions
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSubmissions(data as unknown as Submission[] || []);
      calculateStats(data as unknown as Submission[] || []);
    } catch (error: any) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: Submission[]) => {
    const newStats = {
      total: data.length,
      new: data.filter(s => s.status === 'new').length,
      reviewed: data.filter(s => s.status !== 'new').length,
    };
    setStats(newStats);
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
      const url = await storage.getDownloadUrl(file.path, 3600);
      setPreviewAttachment({ url, filename: file.filename });
    } catch (error: any) {
      console.error('Error loading receipt:', error);
      toast.error('Failed to load attachment');
    } finally {
      setLoadingPreview(false);
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

      toast.success('Submission archived. You can restore it within 7 days.');
      loadSubmissions();
    } catch (error: any) {
      console.error('Error archiving submission:', error);
      toast.error('Failed to archive submission');
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
      loadSubmissions();
    } catch (error: any) {
      console.error('Error restoring submission:', error);
      toast.error('Failed to restore submission');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Organization Name */}
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        {organizationName && (
          <p className="text-muted-foreground">{organizationName}</p>
        )}
        <p className="text-sm text-muted-foreground">Overview of your organization's submissions</p>
      </div>

      {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Submissions
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                All time submissions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                New Submissions
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.new}</div>
              <p className="text-xs text-muted-foreground">
                Requiring review
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Reviewed
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.reviewed}</div>
              <p className="text-xs text-muted-foreground">
                Processed submissions
              </p>
            </CardContent>
          </Card>
        </div>

      {/* Recent Submissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Submissions</CardTitle>
              <CardDescription>
                Showing latest 15 active submissions
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link to="/dashboard/submissions">View All Submissions</Link>
            </Button>
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
                {submissions.slice(0, 15).map((submission) => (
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchiveSubmission(submission.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        Archive
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
    </div>
  );
}
