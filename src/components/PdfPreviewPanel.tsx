import { useState, useRef, useCallback, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePdfAllPages } from '../hooks/usePdfAllPages';
import { pdfjsLib } from '../utils/pdfWorkerSetup';
import { createStampImage } from '../utils/stampUtils';
import {
  reorderPages, rotateMultiplePages, deleteMultiplePages, splitPdfAfterPage,
  applyAnnotations, convertAnnotationToPdf,
} from '../utils/pdfEditUtils';
import { useStore } from '../store/useStore';
import { printPageImage } from '../utils/printUtils';
import type { StampPosition, Settings, StampColor } from '../types';
import type { Annotation, AnnotationTool, AnnotationStyle } from '../types/annotation';
import EditorToolbar from './preview/EditorToolbar';
import AnnotationOverlay from './preview/AnnotationOverlay';

interface Props {
  file: File;
  label: string;
  customOutputName?: string;
  customStampPosition?: StampPosition;
  rotation: 0 | 90 | 180 | 270;
  settings: Settings;
  onClose: () => void;
  onReplaceFile: (newFile: File) => void;
  onSplitFile: (file1: File, file2: File) => void;
  onSavePosition: (pos: StampPosition) => void;
  onResetPosition: () => void;
}

/* ── ソート可能サムネイル ── */
function SortablePageThumb({
  id, children, disabled,
}: {
  id: string; children: React.ReactNode; disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

const DEFAULT_STYLE: AnnotationStyle = {
  strokeEnabled: true,
  strokeColor: '#ef4444',
  fillEnabled: false,
  fillColor: '#ef4444',
  lineWidth: 2,
  opacity: 1,
};

export default function PdfPreviewPanel({
  file, label, customOutputName, customStampPosition, rotation,
  settings, onClose, onReplaceFile, onSplitFile, onSavePosition, onResetPosition,
}: Props) {
  // 単一ページ表示: 高解像度、グリッド表示: サムネイル
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [currentPage, setCurrentPage] = useState(0);

  const thumbWidth = viewMode === 'grid' ? 250 : 700;
  const { pages, loading } = usePdfAllPages(file, thumbWidth);
  const displayName = customOutputName?.trim() || file.name.replace(/\.[^.]+$/, '');
  const totalPages = pages.length;

  // ── スタンプ編集 ──
  const [pos, setPos] = useState<StampPosition>(
    customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );
  const [stampEditing, setStampEditing] = useState(false);
  const [posChanged, setPosChanged] = useState(false);
  const [stampColor, setStampColor] = useState<StampColor>(settings.color);
  const [stampFontSize, setStampFontSize] = useState(settings.fontSize);
  const [stampStyleChanged, setStampStyleChanged] = useState(false);

  // ── ページ選択（複数対応） ──
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const lastClickedRef = useRef<number | null>(null);
  const selectionAnchorRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── 編集状態 ──
  const [editProcessing, setEditProcessing] = useState(false);
  const [editConfirm, setEditConfirm] = useState<'delete' | 'split' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // ── 注釈ツール ──
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [annStyle, setAnnStyle] = useState<AnnotationStyle>(DEFAULT_STYLE);
  const [annotationsByPage, setAnnotationsByPage] = useState<Map<number, Annotation[]>>(new Map());

  // ── ドラッグ中のページ ──
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ページ数変動時に選択/currentPageを範囲内に維持
  useEffect(() => {
    if (pages.length === 0) return;
    setSelectedPages(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < pages.length) next.add(i); });
      return next.size === prev.size ? prev : next;
    });
    setCurrentPage(prev => Math.min(prev, pages.length - 1));
  }, [pages.length]);

  // PDF 1ページ目のサイズ（pt）とCanvas描画サイズ
  const [pdfSize, setPdfSize] = useState({ w: 595, h: 842 });
  const firstPageRef = useRef<HTMLDivElement>(null);
  const [firstPageRect, setFirstPageRect] = useState({ w: 0, h: 0 });

  // スタンプ画像
  const [stampPx, setStampPx] = useState({ w: 60, h: 20 });
  const [stampImageUrl, setStampImageUrl] = useState<string | null>(null);

  const scale = firstPageRect.w > 0 ? firstPageRect.w / pdfSize.w : 1;

  // PDF 1ページ目のサイズを取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        if (!cancelled) {
          if (rotation === 90 || rotation === 270) {
            setPdfSize({ w: vp.height, h: vp.width });
          } else {
            setPdfSize({ w: vp.width, h: vp.height });
          }
        }
        pdf.destroy();
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [file, rotation]);

  // 1ページ目の表示サイズを監視
  useEffect(() => {
    if (!firstPageRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0) setFirstPageRect({ w: width, h: height });
      }
    });
    obs.observe(firstPageRef.current);
    return () => obs.disconnect();
  }, [pages.length, viewMode]);

  // スタンプ画像生成
  useEffect(() => {
    let cancelled = false;
    let prevUrl: string | null = null;
    createStampImage(label, stampFontSize, stampColor, settings.whiteBackground, settings.border)
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
  }, [label, stampFontSize, stampColor, settings.whiteBackground, settings.border]);

  // ── スタンプ位置ドラッグ ──
  const stampDragging = useRef(false);

  const updatePosFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!firstPageRef.current) return;
    const rect = firstPageRef.current.getBoundingClientRect();
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
    setPosChanged(true);
  }, [scale, stampPx]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!stampEditing) return;
    stampDragging.current = true;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [stampEditing, updatePosFromEvent]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!stampDragging.current) return;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [updatePosFromEvent]);

  const handleMouseUp = useCallback(() => { stampDragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const stampLeft = firstPageRect.w - (pos.marginRight + stampPx.w) * scale;
  const stampTop = pos.marginTop * scale;

  const handleSaveStamp = () => {
    onSavePosition(pos);
    if (stampStyleChanged) {
      const { updateSettings } = useStore.getState();
      updateSettings({ color: stampColor, fontSize: stampFontSize });
    }
    setPosChanged(false);
    setStampStyleChanged(false);
    setStampEditing(false);
  };
  const handleResetStamp = () => {
    const defaultPos = { marginRight: settings.marginRight, marginTop: settings.marginTop };
    setPos(defaultPos);
    setStampColor(settings.color);
    setStampFontSize(settings.fontSize);
    onResetPosition();
    setPosChanged(false);
    setStampStyleChanged(false);
    setStampEditing(false);
  };
  const anyStampChanged = posChanged || stampStyleChanged;

  // ── 注釈ハンドラー ──
  const totalAnnotations = Array.from(annotationsByPage.values()).reduce((s, a) => s + a.length, 0);

  const handleAddAnnotation = useCallback((ann: Annotation) => {
    setAnnotationsByPage(prev => {
      const next = new Map(prev);
      const existing = next.get(currentPage) ?? [];
      next.set(currentPage, [...existing, ann]);
      return next;
    });
  }, [currentPage]);

  const handleRemoveAnnotation = useCallback((id: string) => {
    setAnnotationsByPage(prev => {
      const next = new Map(prev);
      const existing = next.get(currentPage) ?? [];
      next.set(currentPage, existing.filter(a => a.id !== id));
      return next;
    });
  }, [currentPage]);

  const handleApplyAnnotations = useCallback(async () => {
    if (totalAnnotations === 0) return;
    setEditError(null);
    setEditProcessing(true);
    try {
      const pdfAnns = [];
      for (const [pageIdx, anns] of annotationsByPage.entries()) {
        for (const ann of anns) {
          pdfAnns.push(convertAnnotationToPdf(
            ann, pageIdx,
            firstPageRect.w, firstPageRect.h,
            pdfSize.w, pdfSize.h,
          ));
        }
      }
      const newFile = await applyAnnotations(file, pdfAnns);
      onReplaceFile(newFile);
      setAnnotationsByPage(new Map());
      setActiveTool('select');
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '注釈の適用に失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, annotationsByPage, totalAnnotations, pdfSize, firstPageRect, onReplaceFile]);

  const handleClearAnnotations = useCallback(() => {
    setAnnotationsByPage(new Map());
    setActiveTool('select');
  }, []);

  // ── ページクリック（複数選択対応） ──
  const handlePageClick = useCallback((pageIndex: number, e: React.MouseEvent) => {
    if (stampEditing && pageIndex === 0) return;
    if (activeTool !== 'select') return; // 注釈ツール使用中はページ選択しない
    setEditConfirm(null);

    setSelectedPages(prev => {
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(prev);
        if (next.has(pageIndex)) next.delete(pageIndex); else next.add(pageIndex);
        lastClickedRef.current = pageIndex;
        selectionAnchorRef.current = pageIndex;
        return next;
      }
      if (e.shiftKey && lastClickedRef.current !== null) {
        const from = Math.min(lastClickedRef.current, pageIndex);
        const to = Math.max(lastClickedRef.current, pageIndex);
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      }
      lastClickedRef.current = pageIndex;
      selectionAnchorRef.current = pageIndex;
      if (prev.size === 1 && prev.has(pageIndex)) return new Set();
      return new Set([pageIndex]);
    });
  }, [stampEditing, activeTool]);

  // ── 矢印キー操作 ──
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (stampEditing || totalPages === 0) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      e.preventDefault();

      if (viewMode === 'single' && !e.shiftKey) {
        setCurrentPage(prev => isNext ? Math.min(prev + 1, totalPages - 1) : Math.max(prev - 1, 0));
        return;
      }

      const cursor = lastClickedRef.current ?? 0;
      const nextCursor = isNext ? Math.min(cursor + 1, totalPages - 1) : Math.max(cursor - 1, 0);

      if (e.shiftKey) {
        if (selectionAnchorRef.current === null) {
          selectionAnchorRef.current = cursor;
        }
        const anchor = selectionAnchorRef.current;
        const from = Math.min(anchor, nextCursor);
        const to = Math.max(anchor, nextCursor);
        const next = new Set<number>();
        for (let i = from; i <= to; i++) next.add(i);
        lastClickedRef.current = nextCursor;
        setSelectedPages(next);
      } else {
        lastClickedRef.current = nextCursor;
        selectionAnchorRef.current = nextCursor;
        setSelectedPages(new Set([nextCursor]));
      }

      setTimeout(() => {
        const thumb = el.querySelector(`[data-page-index="${nextCursor}"]`);
        thumb?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [stampEditing, totalPages, viewMode]);

  // ── 単一ページモード: スクロールでページ送り ──
  const wheelCooldown = useRef(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || viewMode !== 'single') return;
    const handler = (e: WheelEvent) => {
      if (wheelCooldown.current) return;
      if (Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 200);
      if (e.deltaY > 0) {
        setCurrentPage(p => Math.min(totalPages - 1, p + 1));
      } else {
        setCurrentPage(p => Math.max(0, p - 1));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [viewMode, totalPages]);

  const selectAll = useCallback(() => {
    setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i)));
  }, [totalPages]);

  const deselectAll = useCallback(() => {
    setSelectedPages(new Set());
    setEditConfirm(null);
  }, []);

  // ── 計算値 ──
  const selectedArr = Array.from(selectedPages).sort((a, b) => a - b);
  const canDelete = selectedPages.size > 0 && totalPages - selectedPages.size >= 1;
  const singleSelected = selectedPages.size === 1 ? selectedArr[0] : null;
  const canSplit = singleSelected !== null && singleSelected < totalPages - 1 && totalPages > 1;

  // ── ページ編集ハンドラー ──
  const handleRotatePages = useCallback(async () => {
    if (selectedPages.size === 0) return;
    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await rotateMultiplePages(file, selectedArr);
      onReplaceFile(newFile);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ページの回転に失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, selectedPages, selectedArr, onReplaceFile]);

  const handleDeletePages = useCallback(async () => {
    if (!canDelete) return;
    setEditConfirm(null);
    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await deleteMultiplePages(file, selectedArr);
      onReplaceFile(newFile);
      setSelectedPages(new Set());
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ページの削除に失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, selectedArr, canDelete, onReplaceFile]);

  const handleSplitPage = useCallback(async () => {
    if (singleSelected === null) return;
    setEditConfirm(null);
    setEditError(null);
    setEditProcessing(true);
    try {
      const [file1, file2] = await splitPdfAfterPage(file, singleSelected);
      onSplitFile(file1, file2);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ファイルの分割に失敗しました');
      setEditProcessing(false);
    }
  }, [file, singleSelected, onSplitFile]);

  // ── ドラッグ＆ドロップ（ページ並び替え） ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const pageIds = pages.map((_, i) => `page-${i}`);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingPageId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt(String(active.id).replace('page-', ''), 10);
    const newIndex = parseInt(String(over.id).replace('page-', ''), 10);
    if (isNaN(oldIndex) || isNaN(newIndex)) return;

    const order = Array.from({ length: totalPages }, (_, i) => i);
    const reordered = arrayMove(order, oldIndex, newIndex);

    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await reorderPages(file, reordered);
      const indexMap = new Map<number, number>();
      reordered.forEach((origIdx, newIdx) => indexMap.set(origIdx, newIdx));
      setSelectedPages(prev => {
        const next = new Set<number>();
        prev.forEach(origIdx => {
          const mapped = indexMap.get(origIdx);
          if (mapped !== undefined) next.add(mapped);
        });
        return next;
      });
      onReplaceFile(newFile);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ページの並び替えに失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, totalPages, onReplaceFile]);

  // 選択ページのサマリテキスト
  const selectionSummary = selectedPages.size === 0
    ? ''
    : selectedPages.size <= 3
      ? `p.${selectedArr.map(i => i + 1).join(', ')}`
      : `${selectedPages.size}ページ`;

  // ── スタンプオーバーレイ（1ページ目用） ──
  const renderStampOverlay = (pageIndex: number) => {
    if (pageIndex !== 0) return null;
    if (!stampImageUrl || firstPageRect.w <= 0) return null;
    return (
      <img
        src={stampImageUrl}
        alt={label}
        className={`absolute pointer-events-none ${stampEditing ? 'ring-2 ring-orange-400 ring-offset-1 rounded-sm' : ''}`}
        style={{
          left: Math.max(0, stampLeft),
          top: Math.max(0, stampTop),
          width: stampPx.w * scale,
          height: stampPx.h * scale,
        }}
      />
    );
  };

  // ── ページサムネイル（共通コンポーネント） ──
  const renderPageThumb = (i: number, dataUrl: string, isGrid: boolean) => {
    const isSelected = selectedPages.has(i);
    const isFirstPage = i === 0;
    const showOverlay = viewMode === 'single' && !isGrid && activeTool !== 'select' && !stampEditing;
    const pageAnns = annotationsByPage.get(i) ?? [];

    return (
      <div
        data-page-index={i}
        className={`relative cursor-pointer group rounded-md overflow-hidden transition-all select-none ${
          isSelected
            ? 'ring-3 ring-blue-500 ring-offset-1'
            : 'hover:ring-2 hover:ring-blue-200 hover:ring-offset-1'
        }`}
        onClick={(e) => {
          handlePageClick(i, e);
          if (viewMode === 'single') setCurrentPage(i);
        }}
      >
        {isFirstPage ? (
          <div
            ref={firstPageRef}
            className={`relative ${stampEditing ? 'cursor-crosshair' : ''}`}
            onMouseDown={handleMouseDown}
          >
            <img src={dataUrl} alt={`ページ ${i + 1}`} className="w-full bg-white" draggable={false} />
            {renderStampOverlay(i)}
            {showOverlay && (
              <AnnotationOverlay
                containerWidth={firstPageRect.w}
                containerHeight={firstPageRect.h}
                annotations={pageAnns}
                activeTool={activeTool}
                strokeColor={annStyle.strokeColor}
                fillColor={annStyle.fillColor}
                lineWidth={annStyle.lineWidth}
                opacity={annStyle.opacity}
                strokeEnabled={annStyle.strokeEnabled}
                fillEnabled={annStyle.fillEnabled}
                onAddAnnotation={handleAddAnnotation}
                onRemoveAnnotation={handleRemoveAnnotation}
                enabled={!stampEditing}
              />
            )}
            {/* selectモードでも既存注釈を表示 */}
            {viewMode === 'single' && !isGrid && activeTool === 'select' && pageAnns.length > 0 && (
              <AnnotationOverlay
                containerWidth={firstPageRect.w}
                containerHeight={firstPageRect.h}
                annotations={pageAnns}
                activeTool="select"
                strokeColor={annStyle.strokeColor}
                fillColor={annStyle.fillColor}
                lineWidth={annStyle.lineWidth}
                opacity={annStyle.opacity}
                strokeEnabled={annStyle.strokeEnabled}
                fillEnabled={annStyle.fillEnabled}
                onAddAnnotation={handleAddAnnotation}
                onRemoveAnnotation={handleRemoveAnnotation}
                enabled={true}
              />
            )}
          </div>
        ) : (
          <div className="relative">
            <img src={dataUrl} alt={`ページ ${i + 1}`} className="w-full bg-white" draggable={false} />
            {showOverlay && (
              <AnnotationOverlay
                containerWidth={firstPageRect.w}
                containerHeight={firstPageRect.h}
                annotations={pageAnns}
                activeTool={activeTool}
                strokeColor={annStyle.strokeColor}
                fillColor={annStyle.fillColor}
                lineWidth={annStyle.lineWidth}
                opacity={annStyle.opacity}
                strokeEnabled={annStyle.strokeEnabled}
                fillEnabled={annStyle.fillEnabled}
                onAddAnnotation={handleAddAnnotation}
                onRemoveAnnotation={handleRemoveAnnotation}
                enabled={!stampEditing}
              />
            )}
            {viewMode === 'single' && !isGrid && activeTool === 'select' && pageAnns.length > 0 && (
              <AnnotationOverlay
                containerWidth={firstPageRect.w}
                containerHeight={firstPageRect.h}
                annotations={pageAnns}
                activeTool="select"
                strokeColor={annStyle.strokeColor}
                fillColor={annStyle.fillColor}
                lineWidth={annStyle.lineWidth}
                opacity={annStyle.opacity}
                strokeEnabled={annStyle.strokeEnabled}
                fillEnabled={annStyle.fillEnabled}
                onAddAnnotation={handleAddAnnotation}
                onRemoveAnnotation={handleRemoveAnnotation}
                enabled={true}
              />
            )}
          </div>
        )}

        {/* ページ番号バッジ */}
        <div className={`absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded-full leading-none ${isGrid ? 'text-[9px]' : 'text-[11px]'}`}>
          {i + 1} / {totalPages}
        </div>

        {/* 選択チェックマーク */}
        {isSelected && (
          <div className={`absolute top-1 right-1 bg-blue-600 rounded-full flex items-center justify-center shadow ${isGrid ? 'w-5 h-5' : 'w-6 h-6'}`}>
            <svg className={`text-white ${isGrid ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white" ref={panelRef} tabIndex={0} style={{ outline: 'none' }}>
      {/* ヘッダー */}
      <div className="shrink-0 px-3 py-1.5 border-b border-gray-200 flex items-center gap-2">
        <div className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {label}
        </div>
        <div className="flex-1 min-w-0 text-sm text-gray-700 font-medium truncate" title={file.name}>
          {displayName}
        </div>

        {/* 表示切替ボタン */}
        <div className="flex border border-gray-200 rounded overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode('single')}
            className={`px-2 py-0.5 text-[10px] font-medium ${viewMode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            title="単一ページ表示"
          >
            1枚
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2 py-0.5 text-[10px] font-medium ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            title="一覧表示（並び替え・複数選択）"
          >
            一覧
          </button>
        </div>

        {/* 印刷ボタン */}
        <button
          onClick={() => {
            const dataUrl = pages[currentPage];
            if (dataUrl) printPageImage(dataUrl, `${displayName} - ページ ${currentPage + 1}`);
          }}
          disabled={!pages[currentPage]}
          className="shrink-0 text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
          title="このページを印刷"
        >
          印刷
        </button>

        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-bold"
          title="プレビューを閉じる"
        >
          ✕
        </button>
      </div>

      {/* 統合ツールバー */}
      <EditorToolbar
        activeTool={activeTool}
        setActiveTool={(t) => {
          setActiveTool(t);
          if (t !== 'select') {
            setSelectedPages(new Set());
            setEditConfirm(null);
            if (viewMode !== 'single') setViewMode('single');
          }
        }}
        style={annStyle}
        onStyleChange={(patch) => setAnnStyle(prev => ({ ...prev, ...patch }))}
        annotationCount={totalAnnotations}
        onApplyAnnotations={handleApplyAnnotations}
        onClearAnnotations={handleClearAnnotations}

        stampEditing={stampEditing}
        onStartStampEdit={() => { setStampEditing(true); setSelectedPages(new Set()); setEditConfirm(null); setActiveTool('select'); if (viewMode === 'single') setCurrentPage(0); }}
        onSaveStamp={handleSaveStamp}
        onResetStamp={handleResetStamp}
        onCancelStamp={() => {
          setStampEditing(false);
          setPos(customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop });
          setStampColor(settings.color);
          setStampFontSize(settings.fontSize);
          setPosChanged(false);
          setStampStyleChanged(false);
        }}
        anyStampChanged={anyStampChanged}
        customStampPosition={customStampPosition}
        pos={pos}
        stampColor={stampColor}
        setStampColor={setStampColor}
        stampFontSize={stampFontSize}
        setStampFontSize={setStampFontSize}
        setStampStyleChanged={setStampStyleChanged}

        viewMode={viewMode}
        totalPages={totalPages}
        selectedPages={selectedPages}
        selectedArr={selectedArr}
        selectionSummary={selectionSummary}
        canDelete={canDelete}
        canSplit={canSplit}
        singleSelected={singleSelected}
        editProcessing={editProcessing}
        editConfirm={editConfirm}
        setEditConfirm={setEditConfirm}
        onRotate={handleRotatePages}
        onDelete={handleDeletePages}
        onSplit={handleSplitPage}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        settings={settings}
      />

      {/* エラーバナー */}
      {editError && (
        <div className="shrink-0 mx-3 mt-1 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span className="text-red-500 text-xs">⚠</span>
          <p className="text-xs text-red-700 flex-1">{editError}</p>
          <button onClick={() => setEditError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* プレビュー本体 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-y-contain bg-gray-100 relative">
        {/* 処理中オーバーレイ */}
        {editProcessing && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <div className="flex items-center gap-3 bg-white rounded-xl shadow-lg px-5 py-3">
              <div className="w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-700 font-medium">処理中...</span>
            </div>
          </div>
        )}

        {loading && pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        ) : viewMode === 'single' ? (
          /* ── 単一ページ表示 ── */
          <div className="p-3">
            {pages[currentPage] && renderPageThumb(currentPage, pages[currentPage], false)}

            {/* ページ送りコントロール */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-2">
                <button
                  onClick={() => setCurrentPage(0)}
                  disabled={currentPage <= 0}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm text-xs"
                >
                  «
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage <= 0}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-600 font-medium min-w-[60px] text-center">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  ›
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages - 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm text-xs"
                >
                  »
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── グリッド表示（ドラッグ＆ドロップ対応） ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setDraggingPageId(String(e.active.id))}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={pageIds} strategy={rectSortingStrategy}>
              <div
                className="p-3 grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
              >
                {pages.map((dataUrl, i) => (
                  <SortablePageThumb key={pageIds[i]} id={pageIds[i]} disabled={stampEditing}>
                    {renderPageThumb(i, dataUrl, true)}
                  </SortablePageThumb>
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {draggingPageId != null ? (() => {
                const idx = parseInt(draggingPageId.replace('page-', ''), 10);
                const dataUrl = pages[idx];
                if (!dataUrl) return null;
                return (
                  <div className="w-36 rounded-md shadow-2xl ring-2 ring-blue-400 overflow-hidden opacity-85">
                    <img src={dataUrl} alt="" className="w-full bg-white" />
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full leading-none">
                      {idx + 1}
                    </div>
                  </div>
                );
              })() : null}
            </DragOverlay>
          </DndContext>
        )}
        {loading && pages.length > 0 && (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* フッター */}
      {totalPages > 0 && (
        <div className="shrink-0 px-3 py-1 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-500">
          <span>{totalPages}ページ</span>
          <span className="text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
        </div>
      )}
    </div>
  );
}
