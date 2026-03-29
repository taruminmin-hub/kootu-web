import { useState, useRef, useCallback } from 'react';
import type { Annotation, AnnotationTool } from '../../types/annotation';

interface Props {
  containerWidth: number;
  containerHeight: number;
  annotations: Annotation[];
  activeTool: AnnotationTool;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  opacity: number;
  strokeEnabled: boolean;
  fillEnabled: boolean;
  onAddAnnotation: (ann: Annotation) => void;
  onRemoveAnnotation: (id: string) => void;
  enabled: boolean;
}

/** 矩形系ツールか */
function isRectTool(t: AnnotationTool) {
  return t === 'rect' || t === 'ellipse' || t === 'highlight' || t === 'redaction';
}

/** 線系ツールか */
function isLineTool(t: AnnotationTool) {
  return t === 'line' || t === 'arrow';
}

export default function AnnotationOverlay({
  containerWidth, containerHeight, annotations, activeTool,
  strokeColor, fillColor, lineWidth, opacity, strokeEnabled, fillEnabled,
  onAddAnnotation, onRemoveAnnotation, enabled,
}: Props) {
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [current, setCurrent] = useState({ x: 0, y: 0 });
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);
  const freehandRef = useRef<{ x: number; y: number }[]>([]);
  const lastFreehandTime = useRef(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const getPos = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, containerWidth)),
      y: Math.max(0, Math.min(e.clientY - rect.top, containerHeight)),
    };
  }, [containerWidth, containerHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled || activeTool === 'select') return;
    if (e.button !== 0) return;
    if (textInput) return; // テキスト入力中

    const pos = getPos(e);

    if (activeTool === 'text') {
      textSubmittedRef.current = false;
      setTextInput(pos);
      setTimeout(() => textRef.current?.focus(), 50);
      e.preventDefault();
      return;
    }

    setStart(pos);
    setCurrent(pos);
    setDrawing(true);
    if (activeTool === 'freehand') {
      freehandRef.current = [pos];
      setFreehandPoints([pos]);
    }
    e.preventDefault();
  }, [enabled, activeTool, getPos, textInput]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    const pos = getPos(e);
    setCurrent(pos);
    if (activeTool === 'freehand') {
      // 最小距離フィルタ: 2px未満の移動は無視
      const last = freehandRef.current[freehandRef.current.length - 1];
      if (last) {
        const dx = pos.x - last.x, dy = pos.y - last.y;
        if (dx * dx + dy * dy < 4) return;
      }
      freehandRef.current.push(pos);
      // 16ms（≒60fps）スロットリングで再レンダーを抑制
      const now = performance.now();
      if (now - lastFreehandTime.current > 16) {
        lastFreehandTime.current = now;
        setFreehandPoints([...freehandRef.current]);
      }
    }
  }, [drawing, getPos, activeTool]);

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);

    const baseAnn: Omit<Annotation, 'type' | 'width' | 'height' | 'x' | 'y'> = {
      id: crypto.randomUUID(),
      strokeColor,
      fillColor,
      lineWidth,
      opacity,
    };

    if (isRectTool(activeTool)) {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w < 5 || h < 5) return;

      const ann: Annotation = {
        ...baseAnn,
        type: activeTool,
        x, y, width: w, height: h,
        strokeColor: activeTool === 'redaction' ? '#000000' : strokeColor,
        fillColor: activeTool === 'redaction' ? '#000000' : activeTool === 'highlight' ? fillColor : fillColor,
        opacity: activeTool === 'highlight' ? 0.35 : activeTool === 'redaction' ? 1 : opacity,
      };
      onAddAnnotation(ann);
    } else if (isLineTool(activeTool)) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      onAddAnnotation({
        ...baseAnn,
        type: activeTool,
        x: start.x, y: start.y,
        width: 0, height: 0,
        x2: current.x, y2: current.y,
      });
    } else if (activeTool === 'freehand') {
      const pts = freehandRef.current;
      if (pts.length < 3) { setFreehandPoints([]); freehandRef.current = []; return; }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      onAddAnnotation({
        ...baseAnn,
        type: 'freehand',
        x: minX, y: minY,
        width: maxX - minX,
        height: maxY - minY,
        points: pts,
      });
      setFreehandPoints([]);
      freehandRef.current = [];
    }
  }, [drawing, start, current, activeTool, strokeColor, fillColor, lineWidth, opacity, freehandPoints, onAddAnnotation]);

  const textSubmittedRef = useRef(false);
  const handleTextSubmit = useCallback((text: string) => {
    if (textSubmittedRef.current) return; // onBlur + Enter の二重送信を防止
    if (!textInput || !text.trim()) {
      setTextInput(null);
      return;
    }
    textSubmittedRef.current = true;
    onAddAnnotation({
      id: crypto.randomUUID(),
      type: 'text',
      x: textInput.x, y: textInput.y,
      width: 0, height: 0,
      text: text.trim(),
      strokeColor,
      fillColor: 'transparent',
      lineWidth: 0,
      opacity: 1,
    });
    setTextInput(null);
  }, [textInput, strokeColor, onAddAnnotation]);

  // 描画中のプレビュー
  const previewStyle = drawing ? (() => {
    if (isRectTool(activeTool)) {
      return {
        left: Math.min(start.x, current.x),
        top: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      };
    }
    return null;
  })() : null;

  const cursorClass =
    activeTool === 'select' ? 'cursor-default' :
    activeTool === 'text' ? 'cursor-text' :
    'cursor-crosshair';

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 ${enabled ? `${cursorClass} z-10` : 'pointer-events-none z-5'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (drawing) { setDrawing(false); setFreehandPoints([]); freehandRef.current = []; } }}
    >
      {/* 既存の注釈を描画 */}
      {annotations.map(ann => (
        <AnnotationShape key={ann.id} ann={ann} enabled={enabled && activeTool === 'select'} onRemove={onRemoveAnnotation} />
      ))}

      {/* 描画中プレビュー（矩形系） */}
      {previewStyle && isRectTool(activeTool) && (
        <div
          className="absolute pointer-events-none"
          style={{
            ...previewStyle,
            backgroundColor: activeTool === 'redaction' ? 'rgba(0,0,0,0.7)' :
              activeTool === 'highlight' ? `${fillColor}59` :
              fillEnabled ? `${fillColor}33` : 'transparent',
            border: activeTool === 'redaction' ? '2px solid #000' :
              activeTool === 'highlight' ? 'none' :
              strokeEnabled ? `${lineWidth}px solid ${strokeColor}` : 'none',
            borderRadius: activeTool === 'ellipse' ? '50%' : undefined,
          }}
        />
      )}

      {/* 描画中プレビュー（線・矢印） */}
      {drawing && isLineTool(activeTool) && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          {activeTool === 'arrow' && (
            <defs>
              <marker id="preview-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
              </marker>
            </defs>
          )}
          <line
            x1={start.x} y1={start.y}
            x2={current.x} y2={current.y}
            stroke={strokeColor}
            strokeWidth={lineWidth}
            markerEnd={activeTool === 'arrow' ? 'url(#preview-arrowhead)' : undefined}
          />
        </svg>
      )}

      {/* 描画中プレビュー（フリーハンド） */}
      {drawing && activeTool === 'freehand' && freehandPoints.length > 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          <polyline
            points={freehandPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={strokeColor}
            strokeWidth={lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* テキスト入力 */}
      {textInput && (
        <div className="absolute z-20" style={{ left: textInput.x, top: textInput.y }}>
          <textarea
            ref={textRef}
            className="border border-blue-400 bg-white rounded px-1 py-0.5 text-sm resize shadow-lg outline-none"
            style={{ minWidth: 120, minHeight: 32, color: strokeColor }}
            placeholder="テキストを入力..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextSubmit((e.target as HTMLTextAreaElement).value);
              }
              if (e.key === 'Escape') setTextInput(null);
            }}
            onBlur={(e) => handleTextSubmit(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ── 注釈の表示コンポーネント ── */
function AnnotationShape({ ann, enabled, onRemove }: { ann: Annotation; enabled: boolean; onRemove: (id: string) => void }) {
  const removeBtn = enabled && (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove(ann.id); }}
      className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow z-20"
      title="削除"
    >
      ✕
    </button>
  );

  if (ann.type === 'redaction') {
    return (
      <div className="absolute bg-black group" style={{ left: ann.x, top: ann.y, width: ann.width, height: ann.height }}>
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'highlight') {
    return (
      <div
        className="absolute group"
        style={{
          left: ann.x, top: ann.y, width: ann.width, height: ann.height,
          backgroundColor: ann.fillColor,
          opacity: ann.opacity,
        }}
      >
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'rect') {
    return (
      <div
        className="absolute group"
        style={{
          left: ann.x, top: ann.y, width: ann.width, height: ann.height,
          border: `${ann.lineWidth}px solid ${ann.strokeColor}`,
          backgroundColor: ann.fillColor !== 'transparent' ? ann.fillColor : undefined,
          opacity: ann.opacity,
        }}
      >
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'ellipse') {
    return (
      <div
        className="absolute group"
        style={{
          left: ann.x, top: ann.y, width: ann.width, height: ann.height,
          border: `${ann.lineWidth}px solid ${ann.strokeColor}`,
          borderRadius: '50%',
          backgroundColor: ann.fillColor !== 'transparent' ? ann.fillColor : undefined,
          opacity: ann.opacity,
        }}
      >
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'text') {
    return (
      <div
        className="absolute group whitespace-pre-wrap pointer-events-auto"
        style={{
          left: ann.x, top: ann.y,
          color: ann.strokeColor,
          fontSize: 14,
          lineHeight: 1.3,
          opacity: ann.opacity,
        }}
      >
        {ann.text}
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'line' || ann.type === 'arrow') {
    const x1 = ann.x, y1 = ann.y;
    const x2 = ann.x2 ?? ann.x, y2 = ann.y2 ?? ann.y;
    const minX = Math.min(x1, x2) - 15;
    const minY = Math.min(y1, y2) - 15;
    const maxX = Math.max(x1, x2) + 15;
    const maxY = Math.max(y1, y2) + 15;
    const markerId = `arrowhead-${ann.id}`;

    return (
      <div className="absolute group pointer-events-none" style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}>
        <svg className="w-full h-full" style={{ overflow: 'visible' }}>
          {ann.type === 'arrow' && (
            <defs>
              <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={ann.strokeColor} />
              </marker>
            </defs>
          )}
          <line
            x1={x1 - minX} y1={y1 - minY}
            x2={x2 - minX} y2={y2 - minY}
            stroke={ann.strokeColor}
            strokeWidth={ann.lineWidth}
            opacity={ann.opacity}
            markerEnd={ann.type === 'arrow' ? `url(#${markerId})` : undefined}
            className="pointer-events-auto"
          />
        </svg>
        {/* Invisible hit area for hover */}
        <div className="absolute inset-0 pointer-events-auto" />
        {removeBtn}
      </div>
    );
  }

  if (ann.type === 'freehand' && ann.points) {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const p of ann.points) {
      if (p.x < mnX) mnX = p.x;
      if (p.y < mnY) mnY = p.y;
      if (p.x > mxX) mxX = p.x;
      if (p.y > mxY) mxY = p.y;
    }
    const minX = mnX - 5;
    const minY = mnY - 5;
    const maxX = mxX + 5;
    const maxY = mxY + 5;

    return (
      <div className="absolute group pointer-events-none" style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}>
        <svg className="w-full h-full" style={{ overflow: 'visible' }}>
          <polyline
            points={ann.points.map(p => `${p.x - minX},${p.y - minY}`).join(' ')}
            fill="none"
            stroke={ann.strokeColor}
            strokeWidth={ann.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={ann.opacity}
            className="pointer-events-auto"
          />
        </svg>
        <div className="absolute inset-0 pointer-events-auto" />
        {removeBtn}
      </div>
    );
  }

  return null;
}
