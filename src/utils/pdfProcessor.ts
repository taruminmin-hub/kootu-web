import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import type { FileGroup, Settings } from '../types';
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

  // 総ファイル数を計算
  let total = 0;
  for (const g of groups) {
    total += settings.mergeBranches && g.branchFiles.length > 0
      ? 1
      : 1 + g.branchFiles.length;
  }

  let current = 0;
  const results: OutputFile[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const mainNum = settings.startNumber + i;
    const hasBranches = group.branchFiles.length > 0;

    if (settings.mergeBranches && hasBranches) {
      // ── 枝番ファイルを結合して1ファイルに ──
      const merged = await PDFDocument.create();
      const allEntries = [group.mainFile, ...group.branchFiles];

      for (let j = 0; j < allEntries.length; j++) {
        const entry = allEntries[j];
        const branchNum = hasBranches ? j + 1 : null;
        const stampText = generateStampText(sym, mainNum, branchNum, settings.stampFormat);

        const srcBytes = await entry.file.arrayBuffer();
        const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
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
        firstPage.drawImage(img, {
          x: pw - displayW - settings.marginRight,
          y: ph - displayH - settings.marginTop,
          width: displayW,
          height: displayH,
        });
        for (const page of copied) merged.addPage(page);
      }

      const pdfBytes = await merged.save();
      const numText = generateFileNameNumber(sym, mainNum, null, settings.fileNameNumberFormat);
      const base = group.mainFile.file.name.replace(/\.pdf$/i, '');
      results.push({ name: buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat), data: pdfBytes });

      current++;
      onProgress(current, total);
    } else {
      // ── 個別出力 ──
      const allEntries = hasBranches
        ? [group.mainFile, ...group.branchFiles].map((e, j) => ({ entry: e, branchNum: j + 1 }))
        : [{ entry: group.mainFile, branchNum: null as null }];

      for (const { entry, branchNum } of allEntries) {
        const stampText = generateStampText(sym, mainNum, branchNum, settings.stampFormat);
        const numText = generateFileNameNumber(sym, mainNum, branchNum, settings.fileNameNumberFormat);
        const pdfBytes = await stampSinglePdf(entry.file, stampText, settings);
        const base = entry.file.name.replace(/\.pdf$/i, '');
        results.push({ name: buildFileName(numText, base, settings.fileNameJoinFormat, settings.customFileNameFormat), data: pdfBytes });

        current++;
        onProgress(current, total);
      }
    }
  }

  return results;
}

async function stampSinglePdf(
  file: File,
  stampText: string,
  settings: Settings,
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pages.length === 0) return new Uint8Array(bytes);

  const imgBytes = await createStampImage(
    stampText, settings.fontSize, settings.color,
    settings.whiteBackground, settings.border,
  );
  const img = await doc.embedPng(imgBytes);
  const { width: iw, height: ih } = img.size();
  const displayW = iw / 3;
  const displayH = ih / 3;

  const page = pages[0];
  const { width: pw, height: ph } = page.getSize();
  page.drawImage(img, {
    x: pw - displayW - settings.marginRight,
    y: ph - displayH - settings.marginTop,
    width: displayW,
    height: displayH,
  });

  return doc.save();
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
