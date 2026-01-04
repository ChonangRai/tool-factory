import { useState, useCallback } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { toast } from 'sonner';

export interface PDFPageItem {
  id: string;
  file: File;
  rotation: number; // 0, 90, 180, 270
}

export const usePDF = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const mergePDFs = useCallback(async (items: PDFPageItem[]): Promise<Blob | null> => {
    if (items.length < 1) { // Allow 1 file export (e.g. for rotation only)
      toast.error('Please select at least 1 PDF file.');
      return null;
    }

    setIsProcessing(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of items) {
        const arrayBuffer = await item.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const pageIndices = pdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
        
        copiedPages.forEach((page) => {
          // Apply accumulated rotation
          const currentRotation = page.getRotation().angle;
          page.setRotation(degrees(currentRotation + item.rotation));
          mergedPdf.addPage(page);
        });
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
      
      toast.success('PDF processed successfully!');
      return blob;
    } catch (error) {
      console.error('Error processing PDFs:', error);
      toast.error('Failed to process PDFs. Please try again.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const splitPDF = useCallback(async (file: File): Promise<Blob[]> => {
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const pageCount = pdf.getPageCount();
      const blobs: Blob[] = [];

      for (let i = 0; i < pageCount; i++) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdf, [i]);
        newPdf.addPage(copiedPage);
        const pdfBytes = await newPdf.save();
        blobs.push(new Blob([pdfBytes as any], { type: 'application/pdf' }));
      }
      
      toast.success(`Split into ${blobs.length} pages successfully!`);
      return blobs;
    } catch (error) {
      console.error('Error splitting PDF:', error);
      toast.error('Failed to split PDF.');
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    mergePDFs,
    splitPDF,
    isProcessing
  };
};
