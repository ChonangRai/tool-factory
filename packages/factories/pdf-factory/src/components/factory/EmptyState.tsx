import { FileText, ArrowRight } from 'lucide-react';

const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
        <FileText className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-foreground">No pages yet</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Upload a PDF document above to start reordering and editing your pages.
      </p>
      <div className="flex items-center gap-2 text-sm text-primary">
        <span>Upload to get started</span>
        <ArrowRight className="h-4 w-4" />
      </div>
    </div>
  );
};

export default EmptyState;
