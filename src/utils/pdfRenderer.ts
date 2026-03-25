import { pdfjsLib } from './pdfWorkerSetup';

/**
 * PDF の全ページ（または指定ページ）を JPEG base64 文字列の配列として返す。
 * AI 分析用に低解像度でレンダリングする。
 */
export async function renderPagesToBase64(
  file: File,
  options?: { maxWidth?: number; quality?: number },
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const maxWidth = options?.maxWidth ?? 800;
  const quality = options?.quality ?? 0.7;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const count = pdf.numPages;
  const results: string[] = [];

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / viewport.width;
    const scaled = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;

    // data:image/jpeg;base64,... から base64 部分のみ抽出
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    results.push(base64);

    onProgress?.(i, count);
  }

  pdf.destroy();
  return results;
}

/**
 * PDF の1ページ目のみを base64 で返す（自動命名用）
 */
export async function renderFirstPageToBase64(
  file: File,
  options?: { maxWidth?: number; quality?: number },
): Promise<string> {
  const maxWidth = options?.maxWidth ?? 800;
  const quality = options?.quality ?? 0.7;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaled = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  pdf.destroy();
  return dataUrl.split(',')[1];
}
