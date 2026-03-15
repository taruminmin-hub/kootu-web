import { PDFDocument } from 'pdf-lib';

// A4サイズ (pt): 595.28 × 841.89
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 28; // 約1cm

/**
 * 画像ファイルを A4 余白付き PDF に変換して返す
 * 対応形式: JPEG / PNG / HEIC / HEIF / WebP
 */
export async function imageToPdf(file: File): Promise<File> {
  const lowerName = file.name.toLowerCase();
  const isHeic = lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
    || file.type === 'image/heic' || file.type === 'image/heif';

  let jpegBlob: Blob;

  if (isHeic) {
    // HEIC → JPEG 変換（動的インポートでバンドルを遅延）
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    jpegBlob = Array.isArray(result) ? result[0] : result;
  } else {
    // JPEG / PNG / WebP → Canvas 経由で JPEG 化（pdf-lib は JPEG/PNG のみサポート）
    jpegBlob = await normalizeToJpeg(file);
  }

  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  // 画像の実サイズを取得
  const { width: imgW, height: imgH } = await getImageDimensions(jpegBlob);

  // 縦横比を保ちながら A4 内に収まる最大サイズを計算
  const maxW = A4_W - MARGIN * 2;
  const maxH = A4_H - MARGIN * 2;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1); // 拡大はしない
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  // 画像の縦横比で用紙の向きを決定
  const pageW = imgW >= imgH ? A4_H : A4_W;
  const pageH = imgW >= imgH ? A4_W : A4_H;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageW, pageH]);

  const embeddedImage = await pdfDoc.embedJpg(jpegBytes);

  // 用紙中央に配置
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  page.drawImage(embeddedImage, { x, y, width: drawW, height: drawH });

  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const pdfName = file.name.replace(/\.[^.]+$/, '') + '.pdf';
  return new File([pdfBlob], pdfName, { type: 'application/pdf' });
}

/** 画像ファイルを JPEG Blob に変換する（png/webp → jpeg） */
async function normalizeToJpeg(file: File): Promise<Blob> {
  // JPEG はそのまま返す
  if (file.type === 'image/jpeg') return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white'; // 透過PNG対策
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas → Blob 変換失敗')),
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像読み込み失敗')); };
    img.src = url;
  });
}

/** Blob から画像の幅・高さを取得する */
function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('サイズ取得失敗')); };
    img.src = url;
  });
}

/** ファイルが画像（変換対象）かどうか判定 */
export function isImageFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
    lower.endsWith('.png') || lower.endsWith('.webp') ||
    lower.endsWith('.heic') || lower.endsWith('.heif') ||
    file.type.startsWith('image/')
  );
}

/** ファイルが PDF かどうか判定 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
