import { FileOutput, FileSearch, Image as ImageIcon, Layers, Lock, Minimize2, type LucideIcon } from 'lucide-react';

/**
 * What a tool can take in and what it hands on. `encrypted-pdf` is its own
 * kind on purpose: a password-protected file is a PDF that no other tool here
 * can read, which is what makes Protect terminal without anything having to
 * say so. An Unlock tool would simply declare that it accepts one.
 */
export type PdfPayload = 'pdf' | 'encrypted-pdf' | 'image' | 'text';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Present only for tools that are actually built and routable. */
  path?: string;
  capabilities?: string[];
  status: 'live' | 'soon';
  /** What this tool can be handed by a previous one. */
  accepts?: PdfPayload[];
  /** What a finished run can hand on, where that is a file another tool can use. */
  produces?: PdfPayload;
  /**
   * Set false for tools that are not wired to receive a handoff yet, so they
   * are never offered as a next step they could not honour.
   */
  offerAsNext?: boolean;
  /** Valid by payload, but pointless after this particular tool. */
  excludeAsNext?: string[];
}

// The workspace is where merge/split/reorder/rotate/delete/annotate all live,
// so it's one destination rather than six cards pointing at the same route.
export const WORKSPACE_TOOL: Tool = {
  id: 'workspace',
  name: 'PDF Workspace',
  description: 'Combine, split, reorder and annotate your documents in a single place.',
  icon: Layers,
  path: '/factory',
  capabilities: ['Merge', 'Split & extract', 'Reorder', 'Rotate', 'Delete pages', 'Annotate'],
  status: 'live',
  accepts: ['pdf'],
  produces: 'pdf',
};

export const CONVERTER_TOOLS: Tool[] = [
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Save any page as a PNG or JPEG, or grab every page as a ZIP.',
    icon: ImageIcon,
    path: '/factory/pdf-to-image',
    status: 'live',
    accepts: ['pdf'],
    produces: 'image',
    // Not wired to receive a handoff in this batch.
    offerAsNext: false,
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Turn JPEG and PNG images into one PDF, in the order you choose.',
    icon: FileOutput,
    path: '/factory/image-to-pdf',
    status: 'live',
    accepts: ['image'],
    produces: 'pdf',
  },
  {
    id: 'ocr',
    name: 'Make a scan searchable',
    description: 'Read the text in a scanned PDF so you can search, select and copy it.',
    icon: FileSearch,
    path: '/factory/ocr',
    capabilities: ['English OCR', 'Searchable PDF', 'Text file'],
    status: 'live',
    accepts: ['pdf'],
    produces: 'pdf',
  },
];

export const OPTIMIZE_TOOLS: Tool[] = [
  {
    id: 'compress',
    name: 'Compress PDF',
    description: 'Make a PDF smaller, keeping your original when it would not help.',
    icon: Minimize2,
    path: '/factory/compress',
    capabilities: ['Optimise structure', 'Compress scans'],
    status: 'live',
    accepts: ['pdf'],
    produces: 'pdf',
  },
];

export const SECURE_TOOLS: Tool[] = [
  {
    id: 'protect',
    name: 'Protect PDF',
    description: 'Require a password to open a document, encrypted on your device.',
    icon: Lock,
    path: '/factory/protect',
    capabilities: ['AES-256', 'Password to open'],
    status: 'live',
    accepts: ['pdf'],
    produces: 'encrypted-pdf',
  },
];

export const UPCOMING_TOOLS: Tool[] = [];

/** Every routable destination, for the header navigation. */
export const NAV_TOOLS: Tool[] = [
  WORKSPACE_TOOL,
  ...CONVERTER_TOOLS,
  ...OPTIMIZE_TOOLS,
  ...SECURE_TOOLS,
];

export const findTool = (id: string): Tool | undefined => NAV_TOOLS.find((tool) => tool.id === id);

/**
 * The tools a finished result can be carried straight into, derived from the
 * catalog rather than listed per page -- so a new tool becomes a valid next
 * step by declaring what it accepts, and no page has to know about any other.
 */
export const nextToolsFor = (toolId: string): Tool[] => {
  const origin = findTool(toolId);
  const payload = origin?.produces;
  if (!origin || !payload) return [];

  return NAV_TOOLS.filter(
    (tool) =>
      tool.id !== origin.id &&
      !!tool.path &&
      tool.offerAsNext !== false &&
      tool.accepts?.includes(payload) &&
      !origin.excludeAsNext?.includes(tool.id),
  );
};
