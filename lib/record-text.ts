export type ExtractedRecordText = { pages: string[]; problem?: string };

export async function extractRecordText(file: Blob, filename: string): Promise<ExtractedRecordText> {
  if (file.size > 30 * 1024 * 1024) return { pages: [], problem: 'This file is too large for automatic text extraction.' };
  if (file.type === 'text/plain' || file.type === 'text/markdown' || /\.(txt|md)$/i.test(filename)) {
    return { pages: [normaliseRecordText(await file.text())] };
  }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(filename)) {
    return { pages: [], problem: 'Content search supports PDF and plain-text documents. Open this document to read it.' };
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    if (document.numPages > 500) return { pages: [], problem: 'This document has too many pages for automatic text extraction.' };
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      pages.push(normaliseRecordText(text));
      page.cleanup();
    }
    return { pages };
  } catch {
    return { pages: [], problem: 'Text could not be extracted from this PDF. It may be protected or damaged; the original remains available.' };
  } finally {
    await task.destroy();
  }
}

export function normaliseRecordText(text: string) {
  return text.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2').replace(/\uFFFD/g, ' ').replace(/\s+/g, ' ').trim();
}
