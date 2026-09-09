import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { setActivePdf } from '@/lib/activePdf';
import { findTool, nextToolsFor, type Tool } from '@/lib/tools';
import { Button } from '@/components/ui/button';

interface ContinueWithPDFProps {
  /** The finished result, as the same File the page offers for download. */
  file: File;
  /** Catalog id of the tool that produced it. */
  from: string;
  /** Passed on where the producing tool already knew it. */
  pageCount?: number;
  className?: string;
}

/**
 * The "what next" step after a tool has produced a PDF.
 *
 * Which tools appear comes from the catalog's capability metadata, so this
 * component never learns about individual pages, and a page never learns about
 * another page. Download stays where each tool already puts it: this is an
 * addition to the result, not a replacement for it.
 */
const ContinueWithPDF = ({ file, from, pageCount, className }: ContinueWithPDFProps) => {
  const navigate = useNavigate();
  const origin = findTool(from);
  const nextTools = nextToolsFor(from);

  const handleContinue = useCallback(
    (tool: Tool) => {
      if (!origin || !tool.path) return;
      setActivePdf(file, {
        fileName: file.name,
        sourceToolId: origin.id,
        sourceToolName: origin.name,
        producedAt: Date.now(),
        pageCount,
      });
      navigate(tool.path);
    },
    [file, navigate, origin, pageCount],
  );

  if (!origin || nextTools.length === 0) return null;

  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className ?? ''}`}>
      <h2 className="text-base font-semibold text-foreground">Continue with this PDF</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Take this result straight into another tool — no downloading and uploading in between. It stays in this
        tab, and is still never sent anywhere.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {nextTools.map((tool) => (
          <Button key={tool.id} variant="outline" onClick={() => handleContinue(tool)}>
            <tool.icon className="mr-2 h-4 w-4" aria-hidden="true" />
            {tool.name}
            <ArrowRight className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Button>
        ))}
      </div>
    </section>
  );
};

export default ContinueWithPDF;
