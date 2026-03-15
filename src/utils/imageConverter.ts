import { PDFDocument } from 'pdf-lib';

// A4サイズ (pt): 595.28 × 841.89
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 28; // 約1cm

/**
 * 画像ファイルを縦向き A4 余白付き PDF に変換して返す。
 * 横向き画像は 90° 回転して縦向きに揃える。
 * 対応形式: JPEG / PNG / HEIC / HEIF / WebP
 */
export async function imageToPdf(file: File): Promise<File> {
  const lowerName = file.name.toLowerCase();
  const isHeic = lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
    || file.type === 'image/heic' || file.type === 'image/heif';

  let sourceBlob: Blob;

  if (isHeic) {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    sourceBlob = Array.isArray(result) ? result[0] : result;
  } else {
    sourceBlob = file;
  }

  // Canvas で描画してサイズ取得 + 横向きなら 90° CW 回転
  const jpegBlob = await renderToPortraitJpeg(sourceBlob);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const { width: imgW, height: imgH } = await getImageDimensions(jpegBlob);

  // 縦向き A4 内に収まる最大サイズ（縦向きが保証されている）
  const maxW = A4_W - MARGIN * 2;
  const maxH = A4_H - MARGIN * 2;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_W, A4_H]);
  const embeddedImage = await pdfDoc.embedJpg(jpegBytes);

  // 用紙中央に配置
  page.drawImage(embeddedImage, {
    x: (A4_W - drawW) / 2,
    y: (A4_H - drawH) / 2,
    width: drawW,
    height: drawH,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const pdfName = file.name.replace(/\.[^.]+$/, '') + '.pdf';
  return new File([pdfBlob], pdfName, { type: 'application/pdf' });
}

/**
 * 画像 Blob を Canvas 経由で JPEG Blob に変換する。
 * 横向き（幅>高さ）の場合は 90° CW 回転して縦向きにする。
 */
function renderToPortraitJpeg(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const isLandscape = w > h;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      if (isLandscape) {
        // 90° CW 回転: 幅と高さを入れ替えて描画
        canvas.width = h;
        canvas.height = w;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // translate to (h, 0), rotate 90° CW
        ctx.translate(h, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0);
      } else {
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }

      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Canvas → Blob 変換失敗')),
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
