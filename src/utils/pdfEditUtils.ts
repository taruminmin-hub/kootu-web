import { PDFDocument, degrees } from 'pdf-lib';

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
