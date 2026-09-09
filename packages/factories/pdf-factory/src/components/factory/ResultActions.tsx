import { useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Download } from 'lucide-react';
import { setActivePdf } from '@/lib/activePdf';
import { findTool, nextToolsFor, type Tool } from '@/lib/tools';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ResultActionsProps {
  /** The finished result, as the same File the download hands over. */
  file: File;
  /** Catalog id of the tool that produced it. */
  from: string;
  onDownload: () => void;
  downloadLabel?: string;
  /** Passed on where the producing tool already knew it. */
  pageCount?: number;
  /** Overrides the catalog's default, for a tool with a reason to differ. */
  defaultNextId?: string;
  /** Extra result actions, e.g. a text export, shown beside Download. */
  children?: ReactNode;
  className?: string;
}

/**
 * One row of actions for a finished result: `Download PDF  [ Next | v ]`.
 *
 * Download and navigation stay separate -- downloading never moves the user,
 * and continuing never makes them download first. Which tools can come next,
 * and which one `Next` opens, both come from the catalog's capability
 * metadata, so a page never learns about another page and no list is repeated
 * anywhere.
 *
 * A producing tool whose output is finished work (Protect, whose result is
 * encrypted) declares no default: it keeps Download dominant and offers the
 * remaining tools only inside the menu.
 */
const ResultActions = ({
  file,
  from,
  onDownload,
  downloadLabel = 'Download PDF',
  pageCount,
  defaultNextId,
  children,
  className,
}: ResultActionsProps) => {
  const navigate = useNavigate();
  const origin = findTool(from);
  const nextTools = nextToolsFor(from);

  const continueWith = useCallback(
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

  const preferredId = defaultNextId ?? origin?.defaultNext;
  const preferred = nextTools.find((tool) => tool.id === preferredId) ?? null;
  const rest = nextTools.filter((tool) => tool.id !== preferred?.id);
  const label = (tool: Tool) => tool.actionLabel ?? tool.name;

  const menu = (trigger: ReactNode, tools: Tool[]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {tools.map((tool) => (
          <DropdownMenuItem key={tool.id} onSelect={() => continueWith(tool)} className="cursor-pointer gap-2">
            <tool.icon className="h-4 w-4" aria-hidden="true" />
            {label(tool)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${className ?? ''}`}>
      <Button onClick={onDownload}>
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {downloadLabel}
      </Button>

      {children}

      {preferred ? (
        // Split button: the left half acts, the right half offers the rest.
        <div className="inline-flex">
          <Button
            variant="outline"
            onClick={() => continueWith(preferred)}
            className="rounded-r-none"
            title={`Next: ${label(preferred)}`}
            aria-label={`Next: ${label(preferred)}`}
          >
            <preferred.icon className="mr-2 h-4 w-4" aria-hidden="true" />
            Next
          </Button>
          {rest.length > 0 &&
            menu(
              <Button
                variant="outline"
                className="-ml-px rounded-l-none px-2"
                aria-label="Choose another tool to continue with"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>,
              rest,
            )}
        </div>
      ) : (
        nextTools.length > 0 &&
        menu(
          <Button variant="outline" aria-label="Choose a tool to continue with">
            Next
            <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>,
          nextTools,
        )
      )}
    </div>
  );
};

export default ResultActions;
