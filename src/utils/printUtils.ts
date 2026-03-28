import { PDFDocument } from 'pdf-lib';
import type { FileGroup, Settings } from '../types';
import { processAllFiles } from './pdfProcessor';

/**
 * PDFファイルの指定ページのみを抽出して新しいウィンドウで印刷する。
 * 元PDFから該当ページだけをコピーしたPDFを生成するため、高品質な印刷が可能。
 */
export async function printPdfPage(file: File, pageIndex: number): Promise<void> {
  const win = window.open('', '_blank');
  if (!win) {
    alert('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    return;
  }

  try {
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [pageIndex]);
    doc.addPage(page);
    const pdfBytes = await doc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    win.close();
    alert('PDFの印刷準備に失敗しました。');
  }
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
