import type { StampFormat, FileNameNumberFormat, StampColor } from '../types';

// ─── テキスト生成 ─────────────────────────────────────────────

export function getSymbolText(symbol: string, customSymbol: string): string {
  return symbol === 'custom' ? customSymbol : symbol;
}

/**
 * スタンプ用テキストを生成する
 * @param branchNum null=枝番なし, 1=枝番グループの主番, 2以上=枝番
 * @param numberless true のとき符号のみ（番号なし）で返す
 */
export function generateStampText(
  symbolText: string,
  mainNum: number,
  branchNum: number | null,
  format: StampFormat,
  numberless = false,
): string {
  if (numberless) return symbolText;
  if (symbolText === '別紙') {
    return branchNum === null ? `別紙${mainNum}` : `別紙${mainNum}-${branchNum}`;
  }
  switch (format) {
    case 'full-cert':
      return branchNum === null
        ? `${symbolText}第${mainNum}号証`
        : `${symbolText}第${mainNum}号証の${branchNum}`;
    case 'cert':
      return branchNum === null
        ? `${symbolText}${mainNum}号証`
        : `${symbolText}${mainNum}号証の${branchNum}`;
    case 'simple':
      return branchNum === null
        ? `${symbolText}${mainNum}`
        : `${symbolText}${mainNum}の${branchNum}`;
  }
}

/**
 * ファイル名用番号テキストを生成する
 * @param numberless true のとき符号のみ
 */
export function generateFileNameNumber(
  symbolText: string,
  mainNum: number,
  branchNum: number | null,
  format: FileNameNumberFormat,
  numberless = false,
): string {
  if (numberless) return symbolText;
  if (symbolText === '別紙') {
    return branchNum === null ? `別紙${mainNum}` : `別紙${mainNum}-${branchNum}`;
  }
  const pad = (n: number) => String(n).padStart(3, '0');
  switch (format) {
    case 'zero-padded':
      return branchNum === null ? `${symbolText}${pad(mainNum)}` : `${symbolText}${pad(mainNum)}-${branchNum}`;
    case 'simple-no':
      return branchNum === null ? `${symbolText}${mainNum}` : `${symbolText}${mainNum}の${branchNum}`;
    case 'simple-dash':
      return branchNum === null ? `${symbolText}${mainNum}` : `${symbolText}${mainNum}-${branchNum}`;
    case 'full-cert':
      return branchNum === null ? `${symbolText}第${mainNum}号証` : `${symbolText}第${mainNum}号証の${branchNum}`;
    case 'cert':
      return branchNum === null ? `${symbolText}${mainNum}号証` : `${symbolText}${mainNum}号証の${branchNum}`;
  }
}

// ─── Canvas スタンプ画像生成 ──────────────────────────────────

function colorToHex(color: StampColor): string {
  return color === 'red' ? '#CC0000' : color === 'blue' ? '#0055CC' : '#000000';
}

/** スタンプ画像のキャッシュ（同じパラメータで再生成を防止） */
const stampCache = new Map<string, Uint8Array>();

/** キャッシュをクリアする（設定変更時などに呼ぶ） */
export function clearStampCache(): void {
  stampCache.clear();
}

/**
 * Canvas API でスタンプ画像 (PNG) を生成する
 * フォントは CSS で読み込み済みの "Noto Serif JP" を使用
 * 同じパラメータの場合はキャッシュを返す
 */
export async function createStampImage(
  text: string,
  fontSize: number,
  color: StampColor,
  withBackground: boolean,
  withBorder: boolean,
): Promise<Uint8Array> {
  const cacheKey = `${text}|${fontSize}|${color}|${withBackground}|${withBorder}`;
  const cached = stampCache.get(cacheKey);
  if (cached) return cached;
  // フォントがロード済みであることを保証する
  await document.fonts.load(`bold ${fontSize * 3}px "Noto Serif JP"`);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const scale = 3; // 高解像度レンダリング（PDF に埋め込む際に 1/scale 縮小）
  const fpx = fontSize * scale;

  ctx.font = `bold ${fpx}px "Noto Serif JP", serif`;
  const measured = ctx.measureText(text);

  const pad = Math.ceil(4 * scale);
  const w = Math.ceil(measured.width) + pad * 2;
  const h = Math.ceil(fpx * 1.3) + pad * 2;

  canvas.width = w;
  canvas.height = h;

  if (withBackground) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
  }

  if (withBorder) {
    ctx.strokeStyle = colorToHex(color);
    ctx.lineWidth = scale * 0.8;
    ctx.strokeRect(scale * 0.5, scale * 0.5, w - scale, h - scale);
  }

  ctx.font = `bold ${fpx}px "Noto Serif JP", serif`;
  ctx.fillStyle = colorToHex(color);
  ctx.textBaseline = 'top';
  ctx.fillText(text, pad, pad);

  const result = await new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas → Blob 変換失敗')); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
  stampCache.set(cacheKey, result);
  return result;
}
