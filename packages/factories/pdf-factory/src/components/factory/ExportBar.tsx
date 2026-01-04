import { Download, RotateCcw, FileText } from 'lucide-react';

interface ExportBarProps {
  pageCount: number;
  onExport: () => void;
  onSplit?: () => void;
  onReset: () => void;
}

const ExportBar = ({ pageCount, onExport, onSplit, onReset }: ExportBarProps) => {
  if (pageCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Page Count Info */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <FileText className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {pageCount} {pageCount === 1 ? 'file' : 'files'} ready
            </p>
            <p className="text-xs text-muted-foreground">Drag to reorder</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>
          
          {onSplit && (
            <button
              onClick={onSplit}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <span>Split All</span>
            </button>
          )}

          {pageCount >= 2 && (
            <button
              onClick={onExport}
              className="factory-btn-primary"
            >
              <Download className="h-4 w-4" />
              <span>Merge & Export</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportBar;
