import { CornerDownRight } from 'lucide-react';
import type { ActivePdfMeta } from '@/lib/activePdf';

/**
 * Marks input that arrived from another tool rather than from the file
 * picker, so it is never a surprise which document is loaded.
 */
const CarriedFrom = ({ meta }: { meta: ActivePdfMeta }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
    <CornerDownRight className="h-3 w-3" aria-hidden="true" />
    From {meta.sourceToolName}
  </span>
);

export default CarriedFrom;
