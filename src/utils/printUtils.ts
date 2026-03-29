import { PDFDocument } from 'pdf-lib';
import type { FileGroup, Settings, StampPosition, StampColor } from '../types';
import { processAllFiles } from './pdfProcessor';
import { createStampImage } from './stampUtils';

export interface PrintStampOptions {
  /** スタンプに表示するテキスト（例: "甲第1号証"） */
  stampText: string;
  /** スタンプ位置 */
  position: StampPosition;
  /** フォントサイズ */
  fontSize: number;
  /** 色 */
  color: StampColor;
  /** 白背景 */
  whiteBackground: boolean;
  /** 枠線 */
  border: boolean;
}

/**
 * PDFファイルの指定ページにスタンプを付与して新しいウィンドウで印刷する。
 * 元PDFから該当ページだけをコピーし、1ページ目ならスタンプを描画してPDF品質で印刷。
 */
export async function printPdfPage(
  file: File,
  pageIndex: number,
  stamp?: PrintStampOptions,
): Promise<void> {
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

    // スタンプを描画（印刷対象ページに付与）
    if (stamp) {
      const imgBytes = await createStampImage(
        stamp.stampText, stamp.fontSize, stamp.color,
        stamp.whiteBackground, stamp.border,
      );
      const img = await doc.embedPng(imgBytes);
      const { width: iw, height: ih } = img.size();
      const displayW = iw / 3;
      const displayH = ih / 3;
      const printedPage = doc.getPage(0);
      const { width: pw, height: ph } = printedPage.getSize();
      printedPage.drawImage(img, {
        x: pw - displayW - stamp.position.marginRight,
        y: ph - displayH - stamp.position.marginTop,
        width: displayW,
        height: displayH,
      });
    }

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
  // ユーザーアクションの同期コンテキスト内でwindow.openを呼ぶ（ポップアップブロック対策）
  const win = window.open('', '_blank');
  if (!win) {
    alert('ポップアップがブロックされました。ブラウザの設定を確認してください。');
    return;
  }

  try {
    const result = await processAllFiles(groups, settings, onProgress);

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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    win.close();
    alert('PDFの印刷準備に失敗しました。');
  }
}
