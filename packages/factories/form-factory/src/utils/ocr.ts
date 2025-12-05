import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  lines: string[];
}

export const processReceiptImage = async (imageFile: File): Promise<OCRResult> => {
  try {
    const result = await Tesseract.recognize(
      imageFile,
      'eng',
      {
        logger: (m) => console.log(m), // Optional: log progress
      }
    );

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines: result.data.text.split('\n'),
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to process image');
  }
};

export const parseReceiptText = (text: string) => {
  // Simple heuristics to extract common fields
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const lowerText = text.toLowerCase();

  const data: Record<string, any> = {};

  // Try to find amount/total
  // Look for lines starting with "Total", "Amount", "Grand Total"
  const amountRegex = /(?:total|amount|due|balance)[\s:]*[$]?\s*(\d+[.,]\d{2})/i;
  const amountMatch = text.match(amountRegex);
  if (amountMatch) {
    data.amount = parseFloat(amountMatch[1].replace(',', '.'));
  } else {
    // Fallback: look for the largest number that looks like a price
    const prices = text.match(/\d+[.,]\d{2}/g);
    if (prices) {
      const maxPrice = Math.max(...prices.map(p => parseFloat(p.replace(',', '.'))));
      if (maxPrice > 0) data.amount = maxPrice;
    }
  }

  // Try to find date
  // Common date formats: MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY
  const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{4}[/-]\d{1,2}[/-]\d{1,2})/;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    // Try to parse the date
    const dateStr = dateMatch[0];
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      data.date = date.toISOString().split('T')[0];
    }
  }

  // Try to find merchant name (usually the first non-empty line)
  if (lines.length > 0) {
    // Skip common header words if any
    const firstLine = lines[0];
    if (firstLine.length > 3 && !firstLine.match(/receipt|invoice|copy/i)) {
      data.merchant = firstLine;
      data.name = firstLine; // Map to 'name' field often used for merchant
    } else if (lines.length > 1) {
      data.merchant = lines[1];
      data.name = lines[1];
    }
  }

  return data;
};
