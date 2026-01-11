import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Plus } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
  children?: (props: { open: () => void }) => React.ReactNode;
  hasFiles?: boolean;
}

const UploadZone = ({ onUpload, children, hasFiles }: UploadZoneProps) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true,
    noClick: hasFiles // Disable click to upload on container if files exist (let button handle it)
  });

  const rootProps = getRootProps();

  return (
    <div
      {...rootProps}
      className={`factory-upload-zone relative min-h-[400px] transition-all duration-300 ${
        isDragActive ? 'drag-active' : ''
      } ${hasFiles ? 'p-4 sm:p-6 !border-solid' : 'p-8 sm:p-12 flex items-center justify-center cursor-pointer'}`}
    >
      <input {...getInputProps()} />

      {hasFiles ? (
        <div className="w-full space-y-6">
           {children && children({ open })}
        </div>
      ) : (
        <div 
          className="flex flex-col items-center justify-center gap-4 text-center w-full"
        >
          {/* Icon Container */}
          <div className={`relative transition-transform duration-300 ${isDragActive ? 'scale-110' : ''}`}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              {isDragActive ? (
                <FileText className="h-8 w-8 text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-primary" />
              )}
            </div>
            {/* Pulse ring when active */}
            {isDragActive && (
              <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />
            )}
          </div>

          {/* Text */}
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              {isDragActive ? 'Release to upload' : 'Drop your PDFs into the factory'}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to upload
            </p>
          </div>

          {/* Supported formats */}
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
              PDF
            </span>
            <span className="text-xs text-muted-foreground">Max 50MB</span>
          </div>
        </div>
      )}

      {/* Overlay when dragging over existing files */}
      {isDragActive && hasFiles && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Plus className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground">Drop to add more files</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadZone;
