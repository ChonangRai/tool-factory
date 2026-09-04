import { FileOutput, Image as ImageIcon, Layers, Lock, Minimize2, type LucideIcon } from 'lucide-react';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Present only for tools that are actually built and routable. */
  path?: string;
  capabilities?: string[];
  status: 'live' | 'soon';
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
};

export const CONVERTER_TOOLS: Tool[] = [
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Save any page as a PNG or JPEG, or grab every page as a ZIP.',
    icon: ImageIcon,
    path: '/factory/pdf-to-image',
    status: 'live',
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Turn JPEG and PNG images into one PDF, in the order you choose.',
    icon: FileOutput,
    path: '/factory/image-to-pdf',
    status: 'live',
  },
];

export const UPCOMING_TOOLS: Tool[] = [
  {
    id: 'compress',
    name: 'Compress PDF',
    description: 'Reduce file size for easier sharing.',
    icon: Minimize2,
    status: 'soon',
  },
  {
    id: 'protect',
    name: 'Protect PDF',
    description: 'Add password protection to a document.',
    icon: Lock,
    status: 'soon',
  },
];

/** Every routable destination, for the header navigation. */
export const NAV_TOOLS: Tool[] = [WORKSPACE_TOOL, ...CONVERTER_TOOLS];
