import { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { StampPosition, Settings, StampColor } from '../types';
import { createStampImage } from '../utils/stampUtils';
import { useStore } from '../store/useStore';

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
  const { updateSettings } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // スタンプ位置 (pt)
  const [pos, setPos] = useState<StampPosition>(
    initialPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );

  // スタンプ外観のローカル設定（保存時にグローバルに反映）
  const [localFontSize, setLocalFontSize] = useState(settings.fontSize);
  const [localColor, setLocalColor] = useState<StampColor>(settings.color);
  const [localWhiteBg, setLocalWhiteBg] = useState(settings.whiteBackground);
  const [localBorder, setLocalBorder] = useState(settings.border);

  // PDF レンダリング情報
  const [pdfSize, setPdfSize] = useState({ w: 595, h: 842 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [pdfLoadError, setPdfLoadError] = useState(false);

  // スタンプ画像の px サイズ
  const [stampPx, setStampPx] = useState({ w: 60, h: 20 });

  // スタンプ画像のプレビュー URL
  const [stampImageUrl, setStampImageUrl] = useState<string | null>(null);

  const scale = canvasSize.w > 0 ? canvasSize.w / pdfSize.w : 1;

  // PDF を Canvas に描画（回転対応）
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
      } catch {
        if (!cancelled) setPdfLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [file, rotation]);

  // スタンプ画像サイズ計算 + プレビュー生成（ローカル設定を使用）
  useEffect(() => {
    let cancelled = false;
    let prevUrl: string | null = null;
    createStampImage(stampLabel, localFontSize, localColor, localWhiteBg, localBorder)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        prevUrl = url;
        const img = new Image();
        img.onload = () => {
          if (cancelled) { URL.revokeObjectURL(url); return; }
          setStampPx({ w: img.width / 3, h: img.height / 3 });
          setStampImageUrl(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [stampLabel, localFontSize, localColor, localWhiteBg, localBorder, scale]);

  // ドラッグ処理
  const dragging = useRef(false);

  const updatePosFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const stampW = stampPx.w * scale;
    const stampH = stampPx.h * scale;
    const rightPx = rect.width - px - stampW / 2;
    const topPx = py - stampH / 2;
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

  const stampLeft = canvasSize.w - (pos.marginRight + stampPx.w) * scale;
  const stampTop  = pos.marginTop * scale;

  const handleSave = () => {
    // スタンプ外観設定をグローバルに反映
    updateSettings({
      fontSize: localFontSize,
      color: localColor,
      whiteBackground: localWhiteBg,
      border: localBorder,
    });
    onSave(pos);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[95vh] w-full max-w-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-sm font-bold text-gray-800">スタンプ プレビュー / 位置調整</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <p className="text-xs text-gray-400 px-6 pt-3 shrink-0">
          クリックまたはドラッグしてスタンプの位置を調整してください
        </p>

        {/* PDFプレビュー + ドラッグエリア */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {pdfLoadError ? (
            <div className="flex flex-col items-center justify-center gap-3 h-40 bg-red-50 border border-red-200 rounded-xl text-red-600">
              <span className="text-2xl">⚠</span>
              <p className="text-sm font-medium">PDFのプレビューを表示できませんでした</p>
              <p className="text-xs text-red-400">暗号化または破損している可能性があります</p>
            </div>
          ) : (
          <div
            ref={overlayRef}
            className="relative inline-block cursor-crosshair border border-gray-200 shadow"
            style={{ width: canvasSize.w, height: canvasSize.h }}
            onMouseDown={handleMouseDown}
          >
            <canvas ref={canvasRef} className="block" />
            {canvasSize.w > 0 && stampImageUrl && (
              <img
                src={stampImageUrl}
                alt={stampLabel}
                className="absolute pointer-events-none"
                style={{
                  left: stampLeft,
                  top: stampTop,
                  width: stampPx.w * scale,
                  height: stampPx.h * scale,
                }}
              />
            )}
          </div>
          )}
        </div>

        {/* 設定パネル */}
        <div className="px-6 py-3 border-t shrink-0 space-y-4">

          {/* ── スタンプ外観設定 ── */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">スタンプ設定</p>
            <div className="flex flex-wrap items-center gap-4">
              {/* フォントサイズ */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">サイズ: <strong>{localFontSize}pt</strong></span>
                <input
                  type="range" min={8} max={24} value={localFontSize}
                  onChange={(e) => setLocalFontSize(Number(e.target.value))}
                  className="w-24 accent-blue-600"
                />
              </div>

              {/* 色 */}
              <div className="flex gap-1">
                {(['red', 'blue', 'black'] as StampColor[]).map((c) => {
                  const label = c === 'red' ? '赤' : c === 'blue' ? '青' : '黒';
                  const active = localColor === c;
                  const cls = c === 'red' ? 'bg-red-100 border-red-500 text-red-700'
                    : c === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                    : 'bg-gray-100 border-gray-600 text-gray-700';
                  return (
                    <button key={c} onClick={() => setLocalColor(c)}
                      className={`px-3 py-1 rounded-full border-2 text-xs font-medium transition-all ${active ? cls : 'bg-white border-gray-300 text-gray-400'}`}
                    >{label}</button>
                  );
                })}
              </div>

              {/* 白背景 */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                <input type="checkbox" checked={localWhiteBg}
                  onChange={(e) => setLocalWhiteBg(e.target.checked)}
                  className="accent-blue-600 w-3.5 h-3.5"
                />
                白背景
              </label>

              {/* 枠線 */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                <input type="checkbox" checked={localBorder}
                  onChange={(e) => setLocalBorder(e.target.checked)}
                  className="accent-blue-600 w-3.5 h-3.5"
                />
                枠線
              </label>
            </div>
          </div>

          {/* ── 位置設定 ── */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">位置設定 (pt)</p>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500">上からの距離</label>
                <input
                  type="number" min={0} max={500} value={pos.marginTop}
                  onChange={(e) => setPos((p) => ({ ...p, marginTop: Number(e.target.value) }))}
                  className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">右からの距離</label>
                <input
                  type="number" min={0} max={500} value={pos.marginRight}
                  onChange={(e) => setPos((p) => ({ ...p, marginRight: Number(e.target.value) }))}
                  className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                />
              </div>
            </div>
          </div>

          {/* ── ボタン ── */}
          <div className="flex gap-2">
            <button
              onClick={() => { onReset(); onClose(); }}
              className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
            >
              グローバル設定に戻す
            </button>
            <button
              onClick={handleSave}
              className="ml-auto bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
