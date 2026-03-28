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
} from '../utils/pdfEditUtils';
import type { StampPosition, Settings } from '../types';

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

export default function PdfPreviewPanel({
  file, label, customOutputName, customStampPosition, rotation,
  settings, onClose, onReplaceFile, onSplitFile, onSavePosition, onResetPosition,
}: Props) {
  const { pages, loading } = usePdfAllPages(file, 250);
  const displayName = customOutputName?.trim() || file.name.replace(/\.[^.]+$/, '');
  const totalPages = pages.length;

  // ── スタンプ位置調整 ──
  const [pos, setPos] = useState<StampPosition>(
    customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );
  const [stampEditing, setStampEditing] = useState(false);
  const [posChanged, setPosChanged] = useState(false);

  // ── ページ選択（複数対応） ──
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const lastClickedRef = useRef<number | null>(null);

  // ── 編集状態 ──
  const [editProcessing, setEditProcessing] = useState(false);
  const [editConfirm, setEditConfirm] = useState<'delete' | 'split' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // ── ドラッグ中のページ ──
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);

  // ページ数変動時に選択を範囲内に維持
  useEffect(() => {
    if (pages.length === 0) return;
    setSelectedPages(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i < pages.length) next.add(i); });
      return next.size === prev.size ? prev : next;
    });
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
  }, [pages.length]);

  // スタンプ画像生成
  useEffect(() => {
    let cancelled = false;
    let prevUrl: string | null = null;
    createStampImage(label, settings.fontSize, settings.color, settings.whiteBackground, settings.border)
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
  }, [label, settings.fontSize, settings.color, settings.whiteBackground, settings.border]);

  // ── スタンプ位置ドラッグ ──
  const dragging = useRef(false);

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
    dragging.current = true;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [stampEditing, updatePosFromEvent]);

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

  const stampLeft = firstPageRect.w - (pos.marginRight + stampPx.w) * scale;
  const stampTop = pos.marginTop * scale;

  const handleSavePos = () => {
    onSavePosition(pos);
    setPosChanged(false);
    setStampEditing(false);
  };
  const handleResetPos = () => {
    const defaultPos = { marginRight: settings.marginRight, marginTop: settings.marginTop };
    setPos(defaultPos);
    onResetPosition();
    setPosChanged(false);
    setStampEditing(false);
  };

  // ── ページクリック（複数選択対応） ──
  const handlePageClick = useCallback((pageIndex: number, e: React.MouseEvent) => {
    if (stampEditing && pageIndex === 0) return;
    setEditConfirm(null);

    setSelectedPages(prev => {
      if (e.ctrlKey || e.metaKey) {
        // トグル
        const next = new Set(prev);
        if (next.has(pageIndex)) next.delete(pageIndex); else next.add(pageIndex);
        lastClickedRef.current = pageIndex;
        return next;
      }
      if (e.shiftKey && lastClickedRef.current !== null) {
        // 範囲選択
        const from = Math.min(lastClickedRef.current, pageIndex);
        const to = Math.max(lastClickedRef.current, pageIndex);
        const next = new Set(prev);
        for (let i = from; i <= to; i++) next.add(i);
        return next;
      }
      // 通常クリック：単一選択 or 選択解除
      lastClickedRef.current = pageIndex;
      if (prev.size === 1 && prev.has(pageIndex)) return new Set();
      return new Set([pageIndex]);
    });
  }, [stampEditing]);

  const selectAll = useCallback(() => {
    const all = new Set(Array.from({ length: totalPages }, (_, i) => i));
    setSelectedPages(all);
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

    // 新しい順序を構築
    const order = Array.from({ length: totalPages }, (_, i) => i);
    const reordered = arrayMove(order, oldIndex, newIndex);

    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await reorderPages(file, reordered);
      // 選択状態を新しいインデックスにマッピング
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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ヘッダー */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
        <div className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {label}
        </div>
        <div className="flex-1 min-w-0 text-sm text-gray-700 font-medium truncate" title={file.name}>
          {displayName}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-base font-bold"
          title="プレビューを閉じる"
        >
          ✕
        </button>
      </div>

      {/* ツールバー */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50">
        {/* スタンプ位置調整行 */}
        <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap">
          {!stampEditing ? (
            <button
              onClick={() => { setStampEditing(true); setSelectedPages(new Set()); setEditConfirm(null); }}
              className="text-xs text-orange-600 hover:text-orange-800 border border-orange-200 rounded px-2.5 py-1 hover:bg-orange-50 font-medium"
            >
              📍 スタンプ位置
            </button>
          ) : (
            <>
              <span className="text-xs text-orange-600 font-medium">📍 調整中</span>
              <span className="text-[10px] text-gray-400">— 1ページ目をクリック/ドラッグ</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">
                  上: {pos.marginTop}pt ({(pos.marginTop * 0.3528).toFixed(1)}mm) / 右: {pos.marginRight}pt ({(pos.marginRight * 0.3528).toFixed(1)}mm)
                </span>
                <button onClick={handleResetPos} className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100">
                  リセット
                </button>
                <button onClick={handleSavePos} disabled={!posChanged} className="text-[10px] text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded px-2.5 py-0.5 font-medium">
                  保存
                </button>
                <button
                  onClick={() => { setStampEditing(false); setPos(customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop }); setPosChanged(false); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </>
          )}
          {!!customStampPosition && !stampEditing && (
            <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">位置調整済</span>
          )}
        </div>

        {/* ページ編集ツールバー */}
        {!stampEditing && (
          <div className="px-4 py-1.5 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            {/* 選択操作 */}
            <button
              onClick={selectedPages.size === totalPages ? deselectAll : selectAll}
              disabled={totalPages === 0}
              className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
            >
              {selectedPages.size === totalPages ? '選択解除' : '全選択'}
            </button>

            {selectedPages.size > 0 && (
              <>
                <span className="text-xs text-blue-600 font-medium">{selectionSummary} 選択中</span>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleRotatePages}
                  disabled={editProcessing}
                  className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 disabled:opacity-40 font-medium"
                  title="選択ページを時計回りに90°回転"
                >
                  ↻ 回転
                </button>
                <button
                  onClick={() => editConfirm === 'delete' ? setEditConfirm(null) : setEditConfirm('delete')}
                  disabled={editProcessing || !canDelete}
                  className={`text-xs border rounded px-2 py-1 font-medium disabled:opacity-40 ${
                    editConfirm === 'delete'
                      ? 'text-red-700 border-red-400 bg-red-50'
                      : 'text-red-600 hover:text-red-800 border-red-200 hover:bg-red-50'
                  }`}
                  title={!canDelete ? '全ページは削除不可' : `${selectedPages.size}ページを削除`}
                >
                  🗑 削除{selectedPages.size > 1 ? ` (${selectedPages.size})` : ''}
                </button>
                {singleSelected !== null && (
                  <button
                    onClick={() => editConfirm === 'split' ? setEditConfirm(null) : setEditConfirm('split')}
                    disabled={editProcessing || !canSplit}
                    className={`text-xs border rounded px-2 py-1 font-medium disabled:opacity-40 ${
                      editConfirm === 'split'
                        ? 'text-orange-700 border-orange-400 bg-orange-50'
                        : 'text-orange-600 hover:text-orange-800 border-orange-200 hover:bg-orange-50'
                    }`}
                    title={!canSplit ? '分割不可' : `p.${singleSelected + 1}の後で分割`}
                  >
                    ✂ 分割
                  </button>
                )}
                <button
                  onClick={deselectAll}
                  className="text-[10px] text-gray-400 hover:text-gray-600 ml-auto"
                  title="選択解除"
                >
                  ✕
                </button>
              </>
            )}
            {selectedPages.size === 0 && (
              <span className="text-[10px] text-gray-400">クリックで選択 / Ctrl+クリックで複数選択 / ドラッグで並び替え</span>
            )}
          </div>
        )}

        {/* 確認パネル */}
        {editConfirm === 'delete' && selectedPages.size > 0 && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 flex items-center gap-3">
            <span className="text-xs text-red-700 font-medium">
              {selectedPages.size === 1 ? `ページ ${selectedArr[0] + 1} を削除しますか？` : `${selectedPages.size}ページを削除しますか？`}
            </span>
            <button onClick={handleDeletePages} disabled={editProcessing} className="text-xs bg-red-600 text-white rounded px-3 py-1 font-medium hover:bg-red-700 disabled:opacity-50">
              削除する
            </button>
            <button onClick={() => setEditConfirm(null)} className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-white">
              キャンセル
            </button>
          </div>
        )}
        {editConfirm === 'split' && singleSelected !== null && (
          <div className="px-4 py-2 bg-orange-50 border-t border-orange-200 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-orange-700 font-medium">
              p.1〜{singleSelected + 1} と p.{singleSelected + 2}〜{totalPages} に分割しますか？
            </span>
            <button onClick={handleSplitPage} disabled={editProcessing} className="text-xs bg-orange-500 text-white rounded px-3 py-1 font-medium hover:bg-orange-600 disabled:opacity-50">
              分割する
            </button>
            <button onClick={() => setEditConfirm(null)} className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-white">
              キャンセル
            </button>
          </div>
        )}
      </div>

      {/* エラーバナー */}
      {editError && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span className="text-red-500 text-xs">⚠</span>
          <p className="text-xs text-red-700 flex-1">{editError}</p>
          <button onClick={() => setEditError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* プレビュー本体（グリッド + スクロール封じ込め） */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain bg-gray-100 relative">
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
        ) : (
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
                {pages.map((dataUrl, i) => {
                  const isSelected = selectedPages.has(i);
                  return (
                    <SortablePageThumb key={pageIds[i]} id={pageIds[i]} disabled={stampEditing}>
                      <div
                        className={`relative cursor-pointer group rounded-md overflow-hidden transition-all select-none ${
                          isSelected
                            ? 'ring-3 ring-blue-500 ring-offset-1'
                            : 'hover:ring-2 hover:ring-blue-200 hover:ring-offset-1'
                        }`}
                        onClick={(e) => handlePageClick(i, e)}
                      >
                        {/* 1ページ目: スタンプオーバーレイ付き */}
                        {i === 0 ? (
                          <div
                            ref={firstPageRef}
                            className={`relative ${stampEditing ? 'cursor-crosshair' : ''}`}
                            onMouseDown={handleMouseDown}
                          >
                            <img src={dataUrl} alt={`ページ ${i + 1}`} className="w-full bg-white" draggable={false} />
                            {stampImageUrl && firstPageRect.w > 0 && (
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
                            )}
                          </div>
                        ) : (
                          <img src={dataUrl} alt={`ページ ${i + 1}`} className="w-full bg-white" draggable={false} />
                        )}

                        {/* ページ番号バッジ */}
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full leading-none">
                          {i + 1}
                        </div>

                        {/* 選択チェックマーク */}
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shadow">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </SortablePageThumb>
                  );
                })}
              </div>
            </SortableContext>

            {/* ドラッグオーバーレイ */}
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
        <div className="shrink-0 px-4 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>{totalPages} ページ</span>
          <span className="text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
        </div>
      )}
    </div>
  );
}
