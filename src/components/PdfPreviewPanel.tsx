import { useState, useRef, useCallback, useEffect } from 'react';
import { usePdfAllPages } from '../hooks/usePdfAllPages';
import { pdfjsLib } from '../utils/pdfWorkerSetup';
import { createStampImage } from '../utils/stampUtils';
import { rotateSinglePage, deleteSinglePage, splitPdfAfterPage } from '../utils/pdfEditUtils';
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

export default function PdfPreviewPanel({
  file, label, customOutputName, customStampPosition, rotation,
  settings, onClose, onReplaceFile, onSplitFile, onSavePosition, onResetPosition,
}: Props) {
  const { pages, loading } = usePdfAllPages(file, 700);
  const displayName = customOutputName?.trim() || file.name.replace(/\.[^.]+$/, '');
  const totalPages = pages.length;

  // ── スタンプ位置調整 ──
  const [pos, setPos] = useState<StampPosition>(
    customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );
  const [stampEditing, setStampEditing] = useState(false);
  const [posChanged, setPosChanged] = useState(false);

  // ── ページ編集 ──
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
  const [editProcessing, setEditProcessing] = useState(false);
  const [editConfirm, setEditConfirm] = useState<'delete' | 'split' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // ページ数が変わった際に selectedPageIndex を範囲内に保持
  useEffect(() => {
    if (selectedPageIndex !== null && pages.length > 0 && selectedPageIndex >= pages.length) {
      setSelectedPageIndex(pages.length - 1);
    }
  }, [pages.length, selectedPageIndex]);

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

  // ドラッグでスタンプ位置調整
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

  // ── ページ編集ハンドラー ──
  const handleRotatePage = useCallback(async () => {
    if (selectedPageIndex === null) return;
    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await rotateSinglePage(file, selectedPageIndex);
      onReplaceFile(newFile);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ページの回転に失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, selectedPageIndex, onReplaceFile]);

  const handleDeletePage = useCallback(async () => {
    if (selectedPageIndex === null) return;
    setEditConfirm(null);
    setEditError(null);
    setEditProcessing(true);
    try {
      const newFile = await deleteSinglePage(file, selectedPageIndex);
      onReplaceFile(newFile);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ページの削除に失敗しました');
    } finally {
      setEditProcessing(false);
    }
  }, [file, selectedPageIndex, onReplaceFile]);

  const handleSplitPage = useCallback(async () => {
    if (selectedPageIndex === null) return;
    setEditConfirm(null);
    setEditError(null);
    setEditProcessing(true);
    try {
      const [file1, file2] = await splitPdfAfterPage(file, selectedPageIndex);
      onSplitFile(file1, file2);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'ファイルの分割に失敗しました');
      setEditProcessing(false);
    }
  }, [file, selectedPageIndex, onSplitFile]);

  const handlePageClick = useCallback((pageIndex: number) => {
    if (stampEditing && pageIndex === 0) return; // スタンプ位置調整中は1ページ目のクリックを無視
    setEditConfirm(null);
    setSelectedPageIndex(prev => prev === pageIndex ? null : pageIndex);
  }, [stampEditing]);

  const isOnlyPage = !loading && totalPages <= 1;
  const isLastPage = selectedPageIndex !== null && selectedPageIndex >= totalPages - 1;
  const canDelete = selectedPageIndex !== null && !isOnlyPage && totalPages > 0;
  const canSplit = selectedPageIndex !== null && !isLastPage && !isOnlyPage && totalPages > 0;

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

      {/* ツールバー: スタンプ位置 + ページ編集 */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50">
        {/* スタンプ位置調整行 */}
        <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap">
          {!stampEditing ? (
            <button
              onClick={() => { setStampEditing(true); setSelectedPageIndex(null); setEditConfirm(null); }}
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
                <button
                  onClick={handleResetPos}
                  className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100"
                >
                  リセット
                </button>
                <button
                  onClick={handleSavePos}
                  disabled={!posChanged}
                  className="text-[10px] text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded px-2.5 py-0.5 font-medium"
                >
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

          {/* 区切り線 */}
          {!stampEditing && (
            <span className="text-gray-300 mx-1">|</span>
          )}

          {/* ページ編集ボタン群 */}
          {!stampEditing && selectedPageIndex !== null && (
            <>
              <span className="text-xs text-gray-500 font-medium">
                p.{selectedPageIndex + 1}
              </span>
              <button
                onClick={handleRotatePage}
                disabled={editProcessing || totalPages === 0}
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 disabled:opacity-40 font-medium"
                title="このページを時計回りに90°回転"
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
                title={isOnlyPage ? '1ページのみのため削除不可' : 'このページを削除'}
              >
                🗑 削除
              </button>
              <button
                onClick={() => editConfirm === 'split' ? setEditConfirm(null) : setEditConfirm('split')}
                disabled={editProcessing || !canSplit}
                className={`text-xs border rounded px-2 py-1 font-medium disabled:opacity-40 ${
                  editConfirm === 'split'
                    ? 'text-orange-700 border-orange-400 bg-orange-50'
                    : 'text-orange-600 hover:text-orange-800 border-orange-200 hover:bg-orange-50'
                }`}
                title={!canSplit ? '分割不可' : `p.${selectedPageIndex + 1}の後で分割`}
              >
                ✂ 分割
              </button>
              <button
                onClick={() => { setSelectedPageIndex(null); setEditConfirm(null); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 ml-auto"
                title="選択解除"
              >
                ✕
              </button>
            </>
          )}
          {!stampEditing && selectedPageIndex === null && (
            <span className="text-[10px] text-gray-400">ページをクリックして編集</span>
          )}
        </div>

        {/* 確認パネル（削除/分割） */}
        {editConfirm === 'delete' && selectedPageIndex !== null && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 flex items-center gap-3">
            <span className="text-xs text-red-700 font-medium">ページ {selectedPageIndex + 1} を削除しますか？</span>
            <button
              onClick={handleDeletePage}
              disabled={editProcessing}
              className="text-xs bg-red-600 text-white rounded px-3 py-1 font-medium hover:bg-red-700 disabled:opacity-50"
            >
              削除する
            </button>
            <button
              onClick={() => setEditConfirm(null)}
              className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-white"
            >
              キャンセル
            </button>
          </div>
        )}
        {editConfirm === 'split' && selectedPageIndex !== null && (
          <div className="px-4 py-2 bg-orange-50 border-t border-orange-200 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-orange-700 font-medium">
              p.1〜{selectedPageIndex + 1} と p.{selectedPageIndex + 2}〜{totalPages} に分割しますか？
            </span>
            <button
              onClick={handleSplitPage}
              disabled={editProcessing}
              className="text-xs bg-orange-500 text-white rounded px-3 py-1 font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              分割する
            </button>
            <button
              onClick={() => setEditConfirm(null)}
              className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-white"
            >
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

      {/* プレビュー本体（スクロール） */}
      <div className="flex-1 overflow-y-auto bg-gray-100 relative">
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
          <div className="p-4 space-y-1">
            {pages.map((dataUrl, i) => {
              const isSelected = selectedPageIndex === i;
              return (
                <div
                  key={i}
                  className={`relative cursor-pointer transition-all ${
                    isSelected ? 'ring-3 ring-blue-500 ring-offset-2 rounded-sm' : 'hover:ring-2 hover:ring-blue-200 hover:ring-offset-1 rounded-sm'
                  }`}
                  onClick={() => handlePageClick(i)}
                >
                  {/* 1ページ目: スタンプオーバーレイ付き */}
                  {i === 0 ? (
                    <div
                      ref={firstPageRef}
                      className={`relative ${stampEditing ? 'cursor-crosshair' : ''}`}
                      onMouseDown={handleMouseDown}
                    >
                      <img
                        src={dataUrl}
                        alt={`ページ ${i + 1}`}
                        className="w-full shadow-md bg-white"
                        draggable={false}
                      />
                      {/* スタンプ画像オーバーレイ */}
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
                      {/* ページ番号 */}
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                        1 / {totalPages || '?'}
                      </div>
                    </div>
                  ) : (
                    <>
                      <img
                        src={dataUrl}
                        alt={`ページ ${i + 1}`}
                        className="w-full shadow-md bg-white"
                      />
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                        {i + 1} / {totalPages || '?'}
                      </div>
                    </>
                  )}
                  {/* 選択インジケーター */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      選択中
                    </div>
                  )}
                </div>
              );
            })}
            {loading && (
              <div className="text-center py-4">
                <div className="inline-block w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
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
