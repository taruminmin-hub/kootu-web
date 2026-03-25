import { useState, useEffect, useCallback, useRef } from 'react';
import { usePdfAllPages } from '../hooks/usePdfAllPages';
import { rotateSinglePage, deleteSinglePage, splitPdfAfterPage } from '../utils/pdfEditUtils';

interface Props {
  file: File;
  onReplaceFile: (newFile: File) => void;
  onSplitFile: (file1: File, file2: File) => void;
  onClose: () => void;
}

export default function PdfEditModal({ file, onReplaceFile, onSplitFile, onClose }: Props) {
  const [currentPage, setCurrentPage] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'split' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pages, loading } = usePdfAllPages(file, 750);
  const pageCount = pages.length;
  const previewRef = useRef<HTMLDivElement>(null);

  // wheel/keyboard ハンドラが常に最新値を参照できるよう ref で保持
  const pageCountRef = useRef(pageCount);
  const processingRef = useRef(processing);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  useEffect(() => { processingRef.current = processing; }, [processing]);

  // ページ削除後などでカレントページが範囲外になるのを防ぐ
  useEffect(() => {
    if (pageCount > 0 && currentPage >= pageCount) {
      setCurrentPage(pageCount - 1);
    }
  }, [pageCount, currentPage]);

  // キーボードナビゲーション（依存配列には onClose のみ）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (processingRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(pageCountRef.current - 1, p + 1));
      } else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    // capture: true で先に捕捉し、下層モーダルに伝播させない
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // スクロールナビゲーション（マウント時に1回だけ登録）
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (processingRef.current || pageCountRef.current === 0) return;
      e.preventDefault();
      if (e.deltaY > 0) {
        setCurrentPage(p => Math.min(pageCountRef.current - 1, p + 1));
      } else if (e.deltaY < 0) {
        setCurrentPage(p => Math.max(0, p - 1));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // マウント時に1回だけ登録（ref経由で最新値を参照）

  const handleRotate = useCallback(async () => {
    setConfirm(null);
    setError(null);
    setProcessing(true);
    try {
      const newFile = await rotateSinglePage(file, currentPage);
      onReplaceFile(newFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ページの回転に失敗しました');
    } finally {
      setProcessing(false);
    }
  }, [file, currentPage, onReplaceFile]);

  const handleDelete = useCallback(async () => {
    setConfirm(null);
    setError(null);
    setProcessing(true);
    try {
      const newFile = await deleteSinglePage(file, currentPage);
      onReplaceFile(newFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ページの削除に失敗しました');
    } finally {
      setProcessing(false);
    }
  }, [file, currentPage, onReplaceFile]);

  const handleSplit = useCallback(async () => {
    setConfirm(null);
    setError(null);
    setProcessing(true);
    try {
      const [file1, file2] = await splitPdfAfterPage(file, currentPage);
      onSplitFile(file1, file2);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ファイルの分割に失敗しました');
      setProcessing(false);
    }
  }, [file, currentPage, onSplitFile, onClose]);

  const isOnlyPage = !loading && pageCount <= 1;
  const isLastPage = !loading && pageCount > 0 && currentPage >= pageCount - 1;
  const canNavigate = !loading && pageCount > 1;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl overflow-hidden" style={{ height: '92vh' }}>

        {/* ── ヘッダー ── */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 shrink-0">
          <span className="text-xl">📄</span>
          <h2 className="font-semibold text-gray-800 text-sm truncate flex-1 min-w-0">{file.name}</h2>
          {!loading && pageCount > 0 && (
            <span className="shrink-0 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              {pageCount} ページ
            </span>
          )}
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold ml-2"
            title="閉じる (Esc)"
          >
            ✕
          </button>
        </div>

        {/* ── エラーバナー ── */}
        {error && (
          <div className="shrink-0 mx-5 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <span className="text-red-500 shrink-0 mt-0.5">⚠</span>
            <p className="text-xs text-red-700 leading-relaxed flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
          </div>
        )}

        {/* ── ボディ ── */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* ── PDFプレビューエリア ── */}
          <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">

            {/* ページ表示（ホイールでページ送り） */}
            <div ref={previewRef} className="flex-1 flex items-center justify-center overflow-auto p-6 select-none">
              {loading && pageCount === 0 ? (
                <div className="flex flex-col items-center gap-4 text-gray-400">
                  <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">PDFを読み込み中...</p>
                </div>
              ) : pages[currentPage] ? (
                <img
                  src={pages[currentPage]}
                  alt={`ページ ${currentPage + 1}`}
                  className="max-h-full max-w-full object-contain shadow-xl rounded-lg"
                  style={{ maxHeight: 'calc(92vh - 160px)' }}
                />
              ) : (
                <div className="text-gray-400 text-sm">プレビューを表示できません</div>
              )}
            </div>

            {/* ページナビゲーション */}
            <div className="shrink-0 flex items-center justify-center gap-3 py-3 bg-white border-t border-gray-200">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0 || !canNavigate}
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-25 text-lg font-bold transition-colors"
                title="前のページ (←)"
              >
                ◀
              </button>

              <div className="min-w-[120px] text-center">
                {loading && pageCount === 0 ? (
                  <span className="text-xs text-gray-400">読み込み中...</span>
                ) : (
                  <span className="text-sm text-gray-700 font-medium">
                    {currentPage + 1} / {pageCount > 0 ? pageCount : '?'} ページ
                  </span>
                )}
                {loading && pageCount > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">{pageCount}ページ読込済</div>
                )}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={isLastPage || !canNavigate}
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-25 text-lg font-bold transition-colors"
                title="次のページ (→)"
              >
                ▶
              </button>
            </div>
          </div>

          {/* ── コントロールパネル ── */}
          <div className="w-60 shrink-0 border-l border-gray-200 flex flex-col overflow-y-auto">
            <div className="p-5 flex flex-col gap-5">

              {/* ページ操作セクション */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  現在のページ操作
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  ページ {pageCount > 0 ? currentPage + 1 : '-'} に適用
                </p>

                {/* 回転ボタン */}
                <button
                  onClick={handleRotate}
                  disabled={processing || pageCount === 0}
                  className="w-full flex items-center gap-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl px-4 py-3 text-sm font-medium mb-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-lg shrink-0">↻</span>
                  <div className="text-left">
                    <div>このページを回転</div>
                    <div className="text-xs text-blue-500 font-normal">時計回り 90°</div>
                  </div>
                </button>

                {/* 削除ボタン */}
                {confirm === 'delete' ? (
                  <div className="border border-red-200 rounded-xl p-3 mb-2.5 bg-red-50">
                    <p className="text-xs text-red-700 font-medium mb-2">
                      ページ {currentPage + 1} を削除しますか？
                    </p>
                    <p className="text-xs text-red-500 mb-2.5">この操作は元に戻せません</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={processing}
                        className="flex-1 bg-red-600 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        削除する
                      </button>
                      <button
                        onClick={() => setConfirm(null)}
                        className="flex-1 border border-gray-300 bg-white rounded-lg py-1.5 text-xs hover:bg-gray-50 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirm('delete')}
                    disabled={processing || isOnlyPage || pageCount === 0}
                    title={isOnlyPage ? 'ページが1枚のみのため削除できません' : 'このページを削除します'}
                    className="w-full flex items-center gap-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium mb-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="text-base shrink-0">🗑</span>
                    <div className="text-left">
                      <div>このページを削除</div>
                      {isOnlyPage && <div className="text-xs text-red-400 font-normal">1ページのみのため不可</div>}
                    </div>
                  </button>
                )}
              </div>

              {/* 分割セクション */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  ファイル分割
                </h3>

                {confirm === 'split' ? (
                  <div className="border border-orange-200 rounded-xl p-3 bg-orange-50">
                    <p className="text-xs text-orange-700 font-medium mb-1.5">
                      ここで分割しますか？
                    </p>
                    <p className="text-xs text-orange-600 mb-2.5 leading-relaxed">
                      ページ 1〜{currentPage + 1}（前半）と<br />
                      ページ {currentPage + 2}〜{pageCount}（後半）<br />
                      の2ファイルに分割します
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSplit}
                        disabled={processing}
                        className="flex-1 bg-orange-500 text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                      >
                        分割する
                      </button>
                      <button
                        onClick={() => setConfirm(null)}
                        className="flex-1 border border-gray-300 bg-white rounded-lg py-1.5 text-xs hover:bg-gray-50 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirm('split')}
                    disabled={processing || isLastPage || isOnlyPage || pageCount === 0}
                    title={
                      isOnlyPage ? '1ページのみのため分割できません' :
                      isLastPage ? '最後のページでは分割できません（この後にページがありません）' :
                      `このページの後で分割します（前半: 1〜${currentPage + 1}ページ / 後半: ${currentPage + 2}〜${pageCount}ページ）`
                    }
                    className="w-full flex items-center gap-3 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="text-base shrink-0">✂️</span>
                    <div className="text-left">
                      <div>ここで分割</div>
                      {!isLastPage && !isOnlyPage && pageCount > 0 && (
                        <div className="text-xs text-orange-500 font-normal">
                          前半 p.1〜{currentPage + 1} / 後半 p.{currentPage + 2}〜{pageCount}
                        </div>
                      )}
                      {(isLastPage || isOnlyPage) && pageCount > 0 && (
                        <div className="text-xs text-orange-400 font-normal">最後のページのため不可</div>
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* ヒント */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 leading-relaxed">
                  💡 矢印ボタン・← →キー・スクロールでページ移動。操作はPDFファイルに反映されます。
                </p>
              </div>
            </div>
          </div>

          {/* ── 処理中オーバーレイ ── */}
          {processing && (
            <div className="absolute inset-0 bg-white/75 flex flex-col items-center justify-center gap-4 rounded-b-2xl z-10">
              <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-700 font-medium">処理中...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
