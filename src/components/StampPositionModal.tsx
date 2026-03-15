import { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { StampPosition, Settings } from '../types';
import { createStampImage } from '../utils/stampUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface Props {
  file: File;
  stampLabel: string;
  settings: Settings;
  initialPosition?: StampPosition;
  rotation?: 0 | 90 | 180 | 270;
  onSave: (pos: StampPosition) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function StampPositionModal({
  file, stampLabel, settings, initialPosition, rotation, onSave, onReset, onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // pt 座標（PDF座標系: 右から・上から）
  const [pos, setPos] = useState<StampPosition>(
    initialPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );

  // PDF レンダリング情報
  const [pdfSize, setPdfSize] = useState({ w: 595, h: 842 }); // pt
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 }); // px

  // スタンプ画像の px サイズ（canvas 上での表示サイズ）
  const [stampPx, setStampPx] = useState({ w: 60, h: 20 });

  const scale = canvasSize.w > 0 ? canvasSize.w / pdfSize.w : 1;

  // PDF を Canvas に描画
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const displayScale = Math.min(480 / vp.width, 680 / vp.height);
        const scaled = page.getViewport({ scale: displayScale });

        // Render to offscreen canvas first
        const offscreen = document.createElement('canvas');
        offscreen.width = scaled.width;
        offscreen.height = scaled.height;
        const offCtx = offscreen.getContext('2d')!;
        await page.render({ canvasContext: offCtx, viewport: scaled, canvas: offscreen }).promise;

        if (cancelled || !canvasRef.current) return;

        const sw = scaled.width;
        const sh = scaled.height;
        const rot = rotation ?? 0;

        if (rot === 90) {
          canvasRef.current.width = sh;
          canvasRef.current.height = sw;
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.translate(sh, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(offscreen, 0, 0);
          setPdfSize({ w: vp.height, h: vp.width });
          setCanvasSize({ w: sh, h: sw });
        } else if (rot === 270) {
          canvasRef.current.width = sh;
          canvasRef.current.height = sw;
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.translate(0, sw);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(offscreen, 0, 0);
          setPdfSize({ w: vp.height, h: vp.width });
          setCanvasSize({ w: sh, h: sw });
        } else if (rot === 180) {
          canvasRef.current.width = sw;
          canvasRef.current.height = sh;
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.translate(sw, sh);
          ctx.rotate(Math.PI);
          ctx.drawImage(offscreen, 0, 0);
          setPdfSize({ w: vp.width, h: vp.height });
          setCanvasSize({ w: sw, h: sh });
        } else {
          canvasRef.current.width = sw;
          canvasRef.current.height = sh;
          canvasRef.current.getContext('2d')!.drawImage(offscreen, 0, 0);
          setPdfSize({ w: vp.width, h: vp.height });
          setCanvasSize({ w: sw, h: sh });
        }

        pdf.destroy();
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [file, rotation]);

  // スタンプ画像のサイズを計算
  useEffect(() => {
    createStampImage(stampLabel, settings.fontSize, settings.color, settings.whiteBackground, settings.border)
      .then((bytes) => {
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          setStampPx({ w: img.width / 3, h: img.height / 3 });
          URL.revokeObjectURL(url);
        };
        img.src = url;
      })
      .catch(() => {});
  }, [stampLabel, settings, scale]);

  // ドラッグ処理
  const dragging = useRef(false);

  const updatePosFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    // canvas 上のピクセル座標
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    // スタンプ中央を基準に計算
    const stampW = stampPx.w * scale;
    const stampH = stampPx.h * scale;
    const rightPx = rect.width - px - stampW / 2;
    const topPx = py - stampH / 2;
    // pt 座標に変換
    setPos({
      marginRight: Math.max(0, Math.round(rightPx / scale)),
      marginTop: Math.max(0, Math.round(topPx / scale)),
    });
  }, [scale, stampPx]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    updatePosFromEvent(e.clientX, e.clientY);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [updatePosFromEvent]);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // スタンプオーバーレイの canvas 上ピクセル座標
  const stampLeft = canvasSize.w - (pos.marginRight + stampPx.w) * scale;
  const stampTop  = pos.marginTop * scale;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[95vh] w-full max-w-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-sm font-bold text-gray-800">スタンプ位置調整</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <p className="text-xs text-gray-400 px-6 pt-3 shrink-0">
          クリックまたはドラッグしてスタンプの位置を調整してください
        </p>

        {/* PDFプレビュー + ドラッグエリア */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <div
            ref={overlayRef}
            className="relative inline-block cursor-crosshair border border-gray-200 shadow"
            style={{ width: canvasSize.w, height: canvasSize.h }}
            onMouseDown={handleMouseDown}
          >
            <canvas ref={canvasRef} className="block" />
            {/* スタンプ位置インジケーター */}
            {canvasSize.w > 0 && (
              <div
                className="absolute border-2 border-red-500 bg-red-50/60 flex items-center justify-center pointer-events-none"
                style={{
                  left: stampLeft,
                  top: stampTop,
                  width: stampPx.w * scale,
                  height: stampPx.h * scale,
                }}
              >
                <span className="text-red-600 font-bold text-[9px] whitespace-nowrap overflow-hidden">
                  {stampLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 数値入力 */}
        <div className="px-6 py-3 border-t shrink-0">
          <div className="flex gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-500">上からの距離 (pt)</label>
              <input
                type="number" min={0} max={500} value={pos.marginTop}
                onChange={(e) => setPos((p) => ({ ...p, marginTop: Number(e.target.value) }))}
                className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">右からの距離 (pt)</label>
              <input
                type="number" min={0} max={500} value={pos.marginRight}
                onChange={(e) => setPos((p) => ({ ...p, marginRight: Number(e.target.value) }))}
                className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onReset(); onClose(); }}
              className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
            >
              グローバル設定に戻す
            </button>
            <button
              onClick={() => { onSave(pos); onClose(); }}
              className="ml-auto bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700"
            >
              この位置で保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
