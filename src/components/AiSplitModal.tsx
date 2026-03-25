import { useState, useCallback, useRef, useEffect } from 'react';
import type { AiSplitSegment } from '../types';
import { analyzePdfForSplit } from '../utils/aiAnalyzer';
import { splitPdfBySegments } from '../utils/pdfEditUtils';
import { renderPagesToBase64 } from '../utils/pdfRenderer';

interface Props {
  file: File;
  onComplete: (files: Array<{ file: File; suggestedName: string }>) => void;
  onClose: () => void;
}

// セグメントに割り当てる色パレット
const SEGMENT_COLORS = [
  'border-blue-400 bg-blue-50',
  'border-green-400 bg-green-50',
  'border-purple-400 bg-purple-50',
  'border-orange-400 bg-orange-50',
  'border-pink-400 bg-pink-50',
  'border-teal-400 bg-teal-50',
  'border-yellow-400 bg-yellow-50',
  'border-red-400 bg-red-50',
];

const SEGMENT_BADGE_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-yellow-500', 'bg-red-500',
];

type Stage = 'idle' | 'rendering' | 'analyzing' | 'preview' | 'splitting' | 'error';

export default function AiSplitModal({ file, onComplete, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [segments, setSegments] = useState<AiSplitSegment[]>([]);
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Escape で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const startAnalysis = useCallback(async () => {
    setError(null);
    setStage('rendering');

    try {
      // サムネイル生成（プレビュー用に低解像度で）
      const thumbnails = await renderPagesToBase64(
        file,
        { maxWidth: 300, quality: 0.6 },
        (cur, tot) => {
          setProgress({ current: cur, total: tot, label: `ページ画像を生成中... ${cur}/${tot}` });
          setTotalPages(tot);
        },
      );
      setPageThumbnails(thumbnails);

      // AI 分析
      setStage('analyzing');
      setProgress({ current: 0, total: 1, label: 'AI が文書境界を分析中...' });

      const result = await analyzePdfForSplit(file, (stg, cur, tot) => {
        if (stg === 'analyzing') {
          setProgress({ current: cur, total: tot, label: 'AI が文書境界を分析中...' });
        }
      });

      setSegments(result);
      setStage('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析に失敗しました');
      setStage('error');
    }
  }, [file]);

  const updateSegmentName = useCallback((index: number, name: string) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, suggestedName: name } : s));
  }, []);

  // 分割点の追加: pageIndex の後に新しい分割点を追加
  const addSplitPoint = useCallback((pageIndex: number) => {
    setSegments(prev => {
      const newSegs: AiSplitSegment[] = [];
      for (const seg of prev) {
        if (pageIndex >= seg.startPage && pageIndex < seg.endPage) {
          // このセグメントを分割
          newSegs.push({ ...seg, endPage: pageIndex });
          newSegs.push({
            startPage: pageIndex + 1,
            endPage: seg.endPage,
            suggestedName: '新規セグメント',
            documentType: '不明',
            confidence: 0,
          });
        } else {
          newSegs.push(seg);
        }
      }
      return newSegs;
    });
  }, []);

  // 分割点の削除: segIndex と segIndex+1 を結合
  const removeSplitPoint = useCallback((segIndex: number) => {
    setSegments(prev => {
      if (segIndex >= prev.length - 1) return prev;
      const newSegs = [...prev];
      const merged: AiSplitSegment = {
        ...newSegs[segIndex],
        endPage: newSegs[segIndex + 1].endPage,
      };
      newSegs.splice(segIndex, 2, merged);
      return newSegs;
    });
  }, []);

  const handleConfirmSplit = useCallback(async () => {
    setStage('splitting');
    setProgress({ current: 0, total: segments.length, label: 'PDFを分割中...' });
    try {
      const splitFiles = await splitPdfBySegments(
        file,
        segments.map(s => ({ startPage: s.startPage, endPage: s.endPage, name: s.suggestedName })),
      );
      const result = splitFiles.map((f, i) => ({
        file: f,
        suggestedName: segments[i].suggestedName,
      }));
      onComplete(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '分割に失敗しました');
      setStage('error');
    }
  }, [file, segments, onComplete, onClose]);

  // ページがどのセグメントに属するか
  const getSegmentIndex = (pageIndex: number): number => {
    return segments.findIndex(s => pageIndex >= s.startPage && pageIndex <= s.endPage);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl overflow-hidden" style={{ height: '90vh' }}>
        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 shrink-0">
          <span className="text-xl">🤖</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-800 text-sm truncate">AI 自動分割</h2>
            <p className="text-xs text-gray-400 truncate">{file.name}</p>
          </div>
          {totalPages > 0 && (
            <span className="shrink-0 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">{totalPages} ページ</span>
          )}
          <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold">✕</button>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* idle: 開始画面 */}
          {stage === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="text-6xl">📄</div>
              <div className="text-center">
                <p className="text-gray-700 font-medium mb-2">Gemini AI でPDFの文書境界を自動検出します</p>
                <p className="text-sm text-gray-400">ページ画像をAIに送信し、文書の区切りと名前を提案します</p>
              </div>
              <button
                onClick={startAnalysis}
                className="bg-blue-600 text-white rounded-xl px-8 py-3 text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
              >
                🔍 分析開始
              </button>
            </div>
          )}

          {/* rendering / analyzing: 進捗表示 */}
          {(stage === 'rendering' || stage === 'analyzing') && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-700">{progress.label}</p>
              {stage === 'rendering' && progress.total > 0 && (
                <div className="w-64">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* error */}
          {stage === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <span className="text-5xl">⚠</span>
              <p className="text-sm text-red-600 font-medium text-center max-w-md">{error}</p>
              <div className="flex gap-2">
                <button
                  onClick={startAnalysis}
                  className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-blue-700"
                >
                  再試行
                </button>
                <button
                  onClick={onClose}
                  className="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}

          {/* splitting */}
          {stage === 'splitting' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <div className="w-14 h-14 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-700">{progress.label}</p>
            </div>
          )}

          {/* preview: 分割結果のプレビュー */}
          {stage === 'preview' && (
            <>
              {/* セグメント一覧ヘッダー */}
              <div className="shrink-0 px-5 py-3 border-b bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">検出された文書: {segments.length}件</span>
                  <span className="text-xs text-gray-400">（クリックで分割点を追加/削除できます）</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {segments.map((seg, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}>
                      <span className={`w-2 h-2 rounded-full ${SEGMENT_BADGE_COLORS[i % SEGMENT_BADGE_COLORS.length]}`} />
                      <input
                        type="text"
                        value={seg.suggestedName}
                        onChange={(e) => updateSegmentName(i, e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-medium w-24 text-gray-700"
                      />
                      <span className="text-gray-400">p.{seg.startPage + 1}-{seg.endPage + 1}</span>
                      {segments.length > 1 && (
                        <button
                          onClick={() => removeSplitPoint(Math.max(0, i - 1))}
                          className="text-gray-400 hover:text-red-500 ml-0.5"
                          title={i > 0 ? `前のセグメントと結合` : '次のセグメントと結合'}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ページサムネイル一覧 */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-4 gap-3">
                  {pageThumbnails.map((thumb, pageIdx) => {
                    const segIdx = getSegmentIndex(pageIdx);
                    const seg = segments[segIdx];
                    const isFirstInSegment = seg && pageIdx === seg.startPage;
                    const isLastInSegment = seg && pageIdx === seg.endPage;
                    const colorClass = SEGMENT_COLORS[segIdx % SEGMENT_COLORS.length];

                    return (
                      <div key={pageIdx} className="flex flex-col">
                        {/* セグメント開始ラベル */}
                        {isFirstInSegment && (
                          <div className={`text-xs font-medium px-2 py-1 rounded-t-lg border-t border-l border-r ${colorClass}`}>
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${SEGMENT_BADGE_COLORS[segIdx % SEGMENT_BADGE_COLORS.length]}`} />
                            {seg.suggestedName}
                          </div>
                        )}
                        <div className={`relative border-l border-r ${!isFirstInSegment ? 'border-t-0' : ''} ${isLastInSegment ? 'border-b rounded-b-lg' : ''} ${colorClass} p-1`}>
                          <img
                            src={`data:image/jpeg;base64,${thumb}`}
                            alt={`ページ ${pageIdx + 1}`}
                            className="w-full object-contain rounded"
                          />
                          <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                            {pageIdx + 1}
                          </div>
                        </div>
                        {/* ページ間の分割ボタン（最後のページ以外） */}
                        {pageIdx < pageThumbnails.length - 1 && isLastInSegment && (
                          <div className="h-1 bg-red-400 rounded-full my-1 cursor-pointer hover:bg-red-600 transition-colors"
                            title="クリックで結合"
                            onClick={() => removeSplitPoint(segIdx)}
                          />
                        )}
                        {pageIdx < pageThumbnails.length - 1 && !isLastInSegment && (
                          <div className="h-0.5 bg-transparent hover:bg-blue-400 rounded-full my-1 cursor-pointer transition-colors group relative"
                            title="クリックで分割"
                            onClick={() => addSplitPoint(pageIdx)}
                          >
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[9px] text-blue-600 font-bold">
                              + 分割
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* フッター */}
              <div className="shrink-0 px-5 py-3 border-t flex gap-2">
                <button
                  onClick={startAnalysis}
                  className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                >
                  再分析
                </button>
                <button
                  onClick={onClose}
                  className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleConfirmSplit}
                  className="ml-auto bg-green-600 text-white rounded-lg px-6 py-2 text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
                >
                  分割して追加 ({segments.length}件)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
