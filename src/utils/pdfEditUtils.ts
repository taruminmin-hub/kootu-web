import { PDFDocument, degrees, rgb } from 'pdf-lib';
import type { Annotation } from '../types/annotation';

/**
 * PDFの指定ページを時計回りに90°回転させた新しいFileを返す。
 * pdf-libのpage.setRotationはページのMediaBox回転メタデータを変更する。
 */
export async function rotateSinglePage(
  file: File,
  pageIndex: number,
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(pageIndex);
  const current = page.getRotation().angle;
  const next = ((current + 90) % 360 + 360) % 360;
  page.setRotation(degrees(next));
  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/**
 * PDFの指定ページを削除した新しいFileを返す。
 * pageCount が 1 の場合は呼び出し元で防御すること。
 */
export async function deleteSinglePage(
  file: File,
  pageIndex: number,
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.removePage(pageIndex);
  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/**
 * PDFを splitAfterPageIndex（0始まり）の直後で分割する。
 *   file1: ページ 0 〜 splitAfterPageIndex
 *   file2: ページ (splitAfterPageIndex + 1) 〜 末尾
 * splitAfterPageIndex が最終ページの場合は呼び出し元で防御すること。
 */
export async function splitPdfAfterPage(
  file: File,
  splitAfterPageIndex: number,
): Promise<[File, File]> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = src.getPageCount();

  const doc1 = await PDFDocument.create();
  const indices1 = Array.from({ length: splitAfterPageIndex + 1 }, (_, i) => i);
  const pages1 = await doc1.copyPages(src, indices1);
  for (const p of pages1) doc1.addPage(p);

  const doc2 = await PDFDocument.create();
  const indices2 = Array.from(
    { length: pageCount - splitAfterPageIndex - 1 },
    (_, i) => splitAfterPageIndex + 1 + i,
  );
  const pages2 = await doc2.copyPages(src, indices2);
  for (const p of pages2) doc2.addPage(p);

  const bytes1 = await doc1.save();
  const bytes2 = await doc2.save();

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return [
    new File([bytes1.buffer as ArrayBuffer], `${baseName}_1.pdf`, { type: 'application/pdf' }),
    new File([bytes2.buffer as ArrayBuffer], `${baseName}_2.pdf`, { type: 'application/pdf' }),
  ];
}

/**
 * PDFのページ順序を入れ替えた新しいFileを返す。
 * newOrder[i] = 新しい i 番目に配置する元ページのインデックス
 */
export async function reorderPages(
  file: File,
  newOrder: number[],
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const copiedPages = await doc.copyPages(src, newOrder);
  for (const p of copiedPages) doc.addPage(p);
  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/**
 * 複数ページを一括で時計回り90°回転させた新しいFileを返す。
 */
export async function rotateMultiplePages(
  file: File,
  pageIndices: number[],
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const idx of pageIndices) {
    const page = doc.getPage(idx);
    const current = page.getRotation().angle;
    const next = ((current + 90) % 360 + 360) % 360;
    page.setRotation(degrees(next));
  }
  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/**
 * 複数ページを一括削除した新しいFileを返す。
 * 全ページ削除は許可しない（呼び出し元で防御すること）。
 */
export async function deleteMultiplePages(
  file: File,
  pageIndices: number[],
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // インデックスのずれを防ぐため降順で削除
  const sorted = [...pageIndices].sort((a, b) => b - a);
  for (const idx of sorted) doc.removePage(idx);
  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/**
 * PDF を複数のセグメントに分割する。
 * segments: [{ startPage, endPage, name }] (0始まり、endPage は inclusive)
 */
export async function splitPdfBySegments(
  file: File,
  segments: Array<{ startPage: number; endPage: number; name: string }>,
): Promise<File[]> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const results: File[] = [];

  for (const seg of segments) {
    const doc = await PDFDocument.create();
    const indices = Array.from(
      { length: seg.endPage - seg.startPage + 1 },
      (_, i) => seg.startPage + i,
    );
    const pages = await doc.copyPages(src, indices);
    for (const p of pages) doc.addPage(p);
    const pdfBytes = await doc.save();
    results.push(
      new File([pdfBytes.buffer as ArrayBuffer], `${seg.name}.pdf`, { type: 'application/pdf' }),
    );
  }

  return results;
}

/**
 * 墨消し矩形の定義（PDFページ座標系: 左下原点）
 */
export interface RedactionRect {
  /** ページインデックス（0始まり） */
  pageIndex: number;
  /** 矩形の左端（pt、PDF座標） */
  x: number;
  /** 矩形の下端（pt、PDF座標） */
  y: number;
  /** 矩形の幅（pt） */
  width: number;
  /** 矩形の高さ（pt） */
  height: number;
}

/**
 * PDFに墨消し（黒塗り矩形）を適用した新しいFileを返す。
 */
export async function applyRedactions(
  file: File,
  redactions: RedactionRect[],
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  for (const r of redactions) {
    const page = doc.getPage(r.pageIndex);
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      color: rgb(0, 0, 0),
    });
  }

  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

/* ── PDF注釈の定義（PDF座標系） ── */

export interface PdfAnnotation {
  pageIndex: number;
  type: Annotation['type'];
  // PDF座標 (pt, 左下原点)
  x: number;
  y: number;
  width: number;
  height: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  text?: string;
  strokeColor: { r: number; g: number; b: number };
  fillColor: { r: number; g: number; b: number } | null;
  lineWidth: number;
  opacity: number;
}

/** hex色文字列を {r,g,b} (0-1) に変換 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

/**
 * CSS px座標 → PDF pt座標に変換する
 */
export function convertAnnotationToPdf(
  ann: Annotation,
  pageIndex: number,
  displayW: number,
  displayH: number,
  pdfW: number,
  pdfH: number,
): PdfAnnotation {
  const sx = pdfW / displayW;
  const sy = pdfH / displayH;

  const base: PdfAnnotation = {
    pageIndex,
    type: ann.type,
    x: 0, y: 0, width: 0, height: 0,
    strokeColor: hexToRgb(ann.strokeColor),
    fillColor: ann.fillColor && ann.fillColor !== 'transparent' ? hexToRgb(ann.fillColor) : null,
    lineWidth: ann.lineWidth * sx,
    opacity: ann.opacity,
  };

  if (ann.type === 'rect' || ann.type === 'ellipse' || ann.type === 'highlight' || ann.type === 'redaction') {
    base.x = ann.x * sx;
    base.y = pdfH - (ann.y + ann.height) * sy;
    base.width = ann.width * sx;
    base.height = ann.height * sy;
  } else if (ann.type === 'line' || ann.type === 'arrow') {
    base.x = ann.x * sx;
    base.y = pdfH - ann.y * sy;
    base.x2 = (ann.x2 ?? ann.x) * sx;
    base.y2 = pdfH - (ann.y2 ?? ann.y) * sy;
  } else if (ann.type === 'freehand' && ann.points) {
    base.x = ann.x * sx;
    base.y = pdfH - ann.y * sy;
    base.points = ann.points.map(p => ({ x: p.x * sx, y: pdfH - p.y * sy }));
  } else if (ann.type === 'text') {
    base.x = ann.x * sx;
    base.y = pdfH - ann.y * sy;
    base.text = ann.text;
  }

  return base;
}

/**
 * PDFに注釈（図形・テキスト・ハイライト・墨消し等）を適用した新しいFileを返す。
 */
export async function applyAnnotations(
  file: File,
  annotations: PdfAnnotation[],
): Promise<File> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont('Helvetica');

  for (const ann of annotations) {
    const page = doc.getPage(ann.pageIndex);
    const sc = ann.strokeColor;
    const fc = ann.fillColor;

    switch (ann.type) {
      case 'redaction':
        page.drawRectangle({
          x: ann.x, y: ann.y, width: ann.width, height: ann.height,
          color: rgb(0, 0, 0),
        });
        break;

      case 'highlight':
        page.drawRectangle({
          x: ann.x, y: ann.y, width: ann.width, height: ann.height,
          color: fc ? rgb(fc.r, fc.g, fc.b) : rgb(1, 1, 0),
          opacity: ann.opacity,
        });
        break;

      case 'rect':
        page.drawRectangle({
          x: ann.x, y: ann.y, width: ann.width, height: ann.height,
          borderColor: rgb(sc.r, sc.g, sc.b),
          borderWidth: ann.lineWidth,
          color: fc ? rgb(fc.r, fc.g, fc.b) : undefined,
          opacity: ann.opacity,
        });
        break;

      case 'ellipse':
        page.drawEllipse({
          x: ann.x + ann.width / 2,
          y: ann.y + ann.height / 2,
          xScale: ann.width / 2,
          yScale: ann.height / 2,
          borderColor: rgb(sc.r, sc.g, sc.b),
          borderWidth: ann.lineWidth,
          color: fc ? rgb(fc.r, fc.g, fc.b) : undefined,
          opacity: ann.opacity,
        });
        break;

      case 'line':
        page.drawLine({
          start: { x: ann.x, y: ann.y },
          end: { x: ann.x2 ?? ann.x, y: ann.y2 ?? ann.y },
          color: rgb(sc.r, sc.g, sc.b),
          thickness: ann.lineWidth,
          opacity: ann.opacity,
        });
        break;

      case 'arrow': {
        const ex = ann.x2 ?? ann.x;
        const ey = ann.y2 ?? ann.y;
        // 線本体
        page.drawLine({
          start: { x: ann.x, y: ann.y },
          end: { x: ex, y: ey },
          color: rgb(sc.r, sc.g, sc.b),
          thickness: ann.lineWidth,
          opacity: ann.opacity,
        });
        // 矢印ヘッド（三角形）
        const angle = Math.atan2(ey - ann.y, ex - ann.x);
        const headLen = Math.max(ann.lineWidth * 4, 8);
        const a1 = angle + Math.PI * 0.85;
        const a2 = angle - Math.PI * 0.85;
        const svgPath = [
          `M ${ex} ${ey}`,
          `L ${ex + headLen * Math.cos(a1)} ${ey + headLen * Math.sin(a1)}`,
          `L ${ex + headLen * Math.cos(a2)} ${ey + headLen * Math.sin(a2)}`,
          'Z',
        ].join(' ');
        page.drawSvgPath(svgPath, {
          color: rgb(sc.r, sc.g, sc.b),
          opacity: ann.opacity,
        });
        break;
      }

      case 'freehand':
        if (ann.points && ann.points.length > 1) {
          // フリーハンドは連続する線分で描画
          for (let i = 0; i < ann.points.length - 1; i++) {
            page.drawLine({
              start: ann.points[i],
              end: ann.points[i + 1],
              color: rgb(sc.r, sc.g, sc.b),
              thickness: ann.lineWidth,
              opacity: ann.opacity,
            });
          }
        }
        break;

      case 'text':
        if (ann.text) {
          // pdf-lib の Helvetica はASCIIのみ対応。日本語はフォールバック。
          const fontSize = Math.max(ann.lineWidth * 3, 12);
          try {
            page.drawText(ann.text, {
              x: ann.x,
              y: ann.y - fontSize,
              size: fontSize,
              font,
              color: rgb(sc.r, sc.g, sc.b),
              opacity: ann.opacity,
            });
          } catch {
            // 日本語等エンコードできない場合は矩形で代替表示
            const approxW = ann.text.length * fontSize * 0.6;
            page.drawRectangle({
              x: ann.x, y: ann.y - fontSize - 2,
              width: approxW, height: fontSize + 4,
              borderColor: rgb(sc.r, sc.g, sc.b),
              borderWidth: 0.5,
              opacity: ann.opacity,
            });
          }
        }
        break;
    }
  }

  const newBytes = await doc.save();
  return new File([newBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}
