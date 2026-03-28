import { useState, useRef, useCallback } from 'react';

export interface RedactionBox {
  id: string;
  /** CSS pixel座標（表示上の位置） */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  /** 表示領域の幅（px） */
  containerWidth: number;
  /** 表示領域の高さ（px） */
  containerHeight: number;
  boxes: RedactionBox[];
  onAddBox: (box: RedactionBox) => void;
  onRemoveBox: (id: string) => void;
  enabled: boolean;
}

export default function RedactionOverlay({
  containerWidth, containerHeight, boxes, onAddBox, onRemoveBox, enabled,
}: Props) {
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [current, setCurrent] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  const getPos = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, containerWidth)),
      y: Math.max(0, Math.min(e.clientY - rect.top, containerHeight)),
    };
  }, [containerWidth, containerHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    // 右クリックやCtrl+クリックは無視
    if (e.button !== 0) return;
    const pos = getPos(e);
    setStart(pos);
    setCurrent(pos);
    setDrawing(true);
    e.preventDefault();
  }, [enabled, getPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    setCurrent(getPos(e));
  }, [drawing, getPos]);

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    // 小さすぎる矩形は無視（誤クリック防止）
    if (w < 5 || h < 5) return;
    onAddBox({ id: crypto.randomUUID(), x, y, width: w, height: h });
  }, [drawing, start, current, onAddBox]);

  // 描画中の矩形
  const previewRect = drawing ? {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  } : null;

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 ${enabled ? 'cursor-crosshair z-10' : 'pointer-events-none z-5'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (drawing) { setDrawing(false); } }}
    >
      {/* 既存の墨消し矩形 */}
      {boxes.map(box => (
        <div
          key={box.id}
          className="absolute bg-black group"
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        >
          {enabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveBox(box.id); }}
              className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
              title="この墨消しを削除"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* 描画中のプレビュー矩形 */}
      {previewRect && (
        <div
          className="absolute bg-black/70 border-2 border-black"
          style={{
            left: previewRect.left,
            top: previewRect.top,
            width: previewRect.width,
            height: previewRect.height,
          }}
        />
      )}
    </div>
  );
}
