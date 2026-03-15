import { PDFDocument } from 'pdf-lib';

/**
 * PDFファイルの1ページ目が横向き（幅>高さ）かどうかを判定する。
 * 判定できない場合は false を返す。
 */
export async function isPdfLandscape(file: File): Promise<boolean> {
  try {
    const buf = await file.arrayBuffer();
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    if (doc.getPageCount() === 0) return false;
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    // /Rotate で90°/270°が設定されている場合も考慮
    const rotate = page.getRotation().angle;
    const effective = (rotate % 180 !== 0) ? { w: height, h: width } : { w: width, h: height };
    return effective.w > effective.h;
  } catch {
    return false;
  }
}
