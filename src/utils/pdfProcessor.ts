import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import type { FileEntry, FileGroup, Settings } from '../types';
import { getSymbolText, generateStampText, generateFileNameNumber, createStampImage } from './stampUtils';
import { buildFileName } from './fileNameUtils';

export interface OutputFile {
  name: string;
  data: Uint8Array;
}

export async function processAllFiles(
  groups: FileGroup[],
  settings: Settings,
  onProgress: (current: number, total: number) => void,
): Promise<OutputFile[]> {
  const sym = getSymbolText(settings.symbol, settings.customSymbol);
  const nl = settings.numberless;

  let total = 0;
  for (const g of groups) {
    total += (g.mergeBranches ?? settings.mergeBranches) && g.branchFiles.length > 0
      ? 1
      : 1 + g.branchFiles.length;
  }

  let current = 0;
  const results: OutputFile[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const mainNum = settings.startNumber + i;
    const hasBranches = group.branchFiles.length > 0;

    if ((group.mergeBranches ?? settings.mergeBranches) && hasBranches) {
      // ── 枝番ファイルを結合して1ファイルに ──
      const merged = await PDFDocument.create();
      const allEntries = [group.mainFile, ...group.branchFiles];

      for (let j = 0; j < allEntries.length; j++) {
        const entry = allEntries[j];
        const branchNum = hasBranches ? j + 1 : null;
        const stampText = generateStampText(sym, mainNum, branchNum, settings.stampFormat, nl);

        const srcBytes = await entry.file.arrayBuffer();
        let srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
        srcDoc = await physicallyRotateDoc(srcDoc, entry.rotation);
        const copied = await merged.copyPages(srcDoc, srcDoc.getPageIndices());

        const imgBytes = await createStampImage(
          stampText, settings.fontSize, settings.color,
          settings.whiteBackground, settings.border,
        );
        const img = await merged.embedPng(imgBytes);
        const { width: iw, height: ih } = img.size();
        const displayW = iw / 3;
        const displayH = ih / 3;

        const firstPage = copied[0];
        const { width: pw, height: ph } = firstPage.getSize();
        const mRight = entry.customStampPosition?.marginRight ?? settings.marginRight;
        const mTop = entry.customStampPosition?.marginTop ?? settings.marginTop;
        firstPage.drawImage(img, {
          x: pw - displayW - mRight,
          y: ph - displayH - mTop,
          width: displayW,
          height: displayH,
        });
        for (const page of copied) merged.addPage(page);
      }

      const pdfBytes = await merged.save();
      const numText = generateFileNameNumber(sym, mainNum, null, settings.fileNameNumberFormat, nl);
      const base = resolveOutputBaseName(group.mainFile);
      results.push({ name: buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat), data: pdfBytes });

      current++;
      onProgress(current, total);
    } else {
      // ── 個別出力 ──
      const allEntries = hasBranches
        ? [group.mainFile, ...group.branchFiles].map((e, j) => ({ entry: e, branchNum: j + 1 }))
        : [{ entry: group.mainFile, branchNum: null as null }];

      for (const { entry, branchNum } of allEntries) {
        const stampText = generateStampText(sym, mainNum, branchNum, settings.stampFormat, nl);
        const numText = generateFileNameNumber(sym, mainNum, branchNum, settings.fileNameNumberFormat, nl);
        const effectiveSettings = entry.customStampPosition
          ? { ...settings, marginRight: entry.customStampPosition.marginRight, marginTop: entry.customStampPosition.marginTop }
          : settings;
        const pdfBytes = await stampSinglePdf(entry.file, stampText, effectiveSettings, entry.rotation);
        const base = resolveOutputBaseName(entry);
        results.push({ name: buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat), data: pdfBytes });

        current++;
        onProgress(current, total);
      }
    }
  }

  return results;
}

/**
 * PDFDocument の全ページを物理的に回転させた新しい PDFDocument を返す。
 * rotation=0 の場合はそのまま返す。
 * 90° CW / 180° / 270° CW (= 90° CCW) に対応。
 */
async function physicallyRotateDoc(
  srcDoc: PDFDocument,
  rotation: 0 | 90 | 180 | 270,
): Promise<PDFDocument> {
  if (!rotation) return srcDoc;

  const newDoc = await PDFDocument.create();
  const pageCount = srcDoc.getPageCount();

  for (let i = 0; i < pageCount; i++) {
    const srcPage = srcDoc.getPage(i);
    const { width: pw, height: ph } = srcPage.getSize();

    // srcDoc のページを newDoc に埋め込む
    const embedded = await newDoc.embedPage(srcPage);

    let newW: number, newH: number;
    let x: number, y: number, drawW: number, drawH: number, rotDeg: number;

    if (rotation === 90) {          // 90° 時計回り
      [newW, newH] = [ph, pw];
      [x, y, drawW, drawH, rotDeg] = [0, pw, pw, ph, -90];
    } else if (rotation === 270) {  // 90° 反時計回り
      [newW, newH] = [ph, pw];
      [x, y, drawW, drawH, rotDeg] = [ph, 0, pw, ph, 90];
    } else {                        // 180°
      [newW, newH] = [pw, ph];
      [x, y, drawW, drawH, rotDeg] = [pw, ph, pw, ph, 180];
    }

    const newPage = newDoc.addPage([newW, newH]);
    newPage.drawPage(embedded, {
      x, y,
      width: drawW,
      height: drawH,
      rotate: degrees(rotDeg),
    });
  }

  return newDoc;
}

/** カスタム出力名が設定されていればそれを、なければ元ファイル名（拡張子なし）を返す */
function resolveOutputBaseName(entry: FileEntry): string {
  if (entry.customOutputName?.trim()) return entry.customOutputName.trim();
  return entry.file.name.replace(/\.[^.]+$/, '');
}

async function stampSinglePdf(
  file: File,
  stampText: string,
  settings: Settings,
  rotation: 0 | 90 | 180 | 270 = 0,
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  let doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc = await physicallyRotateDoc(doc, rotation);
  const pages = doc.getPages();
  if (pages.length === 0) return new Uint8Array(bytes);

  // ── スタンプ（1ページ目のみ）
  const imgBytes = await createStampImage(
    stampText, settings.fontSize, settings.color,
    settings.whiteBackground, settings.border,
  );
  const img = await doc.embedPng(imgBytes);
  const { width: iw, height: ih } = img.size();
  const displayW = iw / 3;
  const displayH = ih / 3;

  const firstPage = pages[0];
  const { width: pw, height: ph } = firstPage.getSize();
  firstPage.drawImage(img, {
    x: pw - displayW - settings.marginRight,
    y: ph - displayH - settings.marginTop,
    width: displayW,
    height: displayH,
  });

  // ── ページ番号（全ページ）
  if (settings.pageNumberEnabled) {
    await addPageNumbers(doc, pages, settings);
  }

  return doc.save();
}

/** 全ページにページ番号画像を描画する */
async function addPageNumbers(
  doc: PDFDocument,
  pages: ReturnType<PDFDocument['getPages']>,
  settings: Settings,
): Promise<void> {
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const pageNum = i + 1;
    let text: string;
    switch (settings.pageNumberFormat) {
      case 'n/total': text = `${pageNum}/${total}`; break;
      case 'dash-n-dash': text = `- ${pageNum} -`; break;
      default: text = String(pageNum);
    }

    const imgBytes = await createStampImage(
      text,
      settings.pageNumberFontSize,
      settings.pageNumberColor,
      false,
      false,
    );
    const img = await doc.embedPng(imgBytes);
    const { width: iw, height: ih } = img.size();
    const displayW = iw / 3;
    const displayH = ih / 3;

    const page = pages[i];
    const { width: pw } = page.getSize();
    const margin = 20;

    let x: number;
    switch (settings.pageNumberPosition) {
      case 'bottom-right': x = pw - displayW - margin; break;
      case 'bottom-left':  x = margin; break;
      default:             x = (pw - displayW) / 2; // bottom-center
    }
    const y = margin;

    page.drawImage(img, { x, y, width: displayW, height: displayH });
  }
}

/** 処理せずにファイル名のみを事前計算して返す */
export function computeOutputFileNames(groups: FileGroup[], settings: Settings): string[] {
  const sym = getSymbolText(settings.symbol, settings.customSymbol);
  const nl = settings.numberless;
  const results: string[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const mainNum = settings.startNumber + i;
    const hasBranches = group.branchFiles.length > 0;
    const groupMerge = group.mergeBranches ?? settings.mergeBranches;

    if (groupMerge && hasBranches) {
      const numText = generateFileNameNumber(sym, mainNum, null, settings.fileNameNumberFormat, nl);
      const base = resolveOutputBaseName(group.mainFile);
      results.push(buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat));
    } else {
      const allEntries = hasBranches
        ? [group.mainFile, ...group.branchFiles].map((e, j) => ({ entry: e, branchNum: j + 1 as number | null }))
        : [{ entry: group.mainFile, branchNum: null as null }];
      for (const { entry, branchNum } of allEntries) {
        const numText = generateFileNameNumber(sym, mainNum, branchNum, settings.fileNameNumberFormat, nl);
        const base = resolveOutputBaseName(entry);
        results.push(buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat));
      }
    }
  }

  return results;
}

export async function downloadAsZip(files: OutputFile[]): Promise<void> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '証拠番号付きPDF.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
