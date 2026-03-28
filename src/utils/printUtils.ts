import type { FileGroup, Settings } from '../types';
import { processAllFiles } from './pdfProcessor';

/**
 * 単一ページの画像データURLを新しいウィンドウで印刷する
 */
export function printPageImage(dataUrl: string, pageLabel: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${pageLabel}</title>
      <style>
        @media print {
          @page { margin: 0; }
          body { margin: 0; }
          img { width: 100vw; height: auto; max-height: 100vh; object-fit: contain; }
        }
        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
        img { max-width: 100%; max-height: 100vh; }
      </style>
    </head>
    <body>
      <img src="${dataUrl}" />
      <script>
        window.onload = function() { window.print(); };
        window.onafterprint = function() { window.close(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

/**
 * 全ファイルにスタンプを付与して一括印刷する
 */
export async function printAllWithStamps(
  groups: FileGroup[],
  settings: Settings,
  onProgress: (current: number, total: number, currentFileName?: string) => void,
): Promise<void> {
  const result = await processAllFiles(groups, settings, onProgress);

  // 全PDFをBlobURLに変換し、iframe経由で印刷
  const win = window.open('', '_blank');
  if (!win) {
    alert('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    return;
  }

  // PDFを結合して1つのPDFにして印刷
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (const file of result.files) {
    try {
      const src = await PDFDocument.load(file.data);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch {
      // 読み込めないPDFはスキップ
    }
  }

  const mergedBytes = await merged.save();
  const blob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  win.location.href = url;
  // 印刷後にクリーンアップ
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
