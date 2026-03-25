import { useState, useCallback, useEffect } from 'react';
import type { FileGroup } from '../types';
import { analyzeFilesForNaming } from '../utils/aiAnalyzer';

interface Props {
  groups: FileGroup[];
  onApply: (updates: Array<{ groupId: string; fileId: string; name: string }>) => void;
  onClose: () => void;
}

interface Suggestion {
  groupId: string;
  fileId: string;
  originalName: string;
  suggestedName: string;
  accepted: boolean;
}

type Stage = 'idle' | 'rendering' | 'analyzing' | 'preview' | 'error';

export default function AiNameModal({ groups, onApply, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Escape で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // 各グループのメインファイルを対象にする
  const targetEntries = groups.map(g => ({
    groupId: g.id,
    fileId: g.mainFile.id,
    file: g.mainFile.file,
    originalName: g.mainFile.customOutputName?.trim() || g.mainFile.file.name.replace(/\.[^.]+$/, ''),
  }));

  const startAnalysis = useCallback(async () => {
    setError(null);
    setStage('rendering');

    try {
      const files = targetEntries.map(e => e.file);
      const result = await analyzeFilesForNaming(files, (stg, cur, tot) => {
        if (stg === 'rendering') {
          setStage('rendering');
          setProgress({ current: cur, total: tot, label: `ページ画像を生成中... ${cur}/${tot}` });
        } else {
          setStage('analyzing');
          setProgress({ current: cur, total: tot, label: 'AI が文書を分析中...' });
        }
      });

      const suggs: Suggestion[] = targetEntries.map((entry, i) => ({
        groupId: entry.groupId,
        fileId: entry.fileId,
        originalName: entry.originalName,
        suggestedName: result[i]?.suggestedName ?? entry.originalName,
        accepted: true,
      }));

      setSuggestions(suggs);
      setStage('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析に失敗しました');
      setStage('error');
    }
  }, [targetEntries]);

  const toggleAccepted = useCallback((index: number) => {
    setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, accepted: !s.accepted } : s));
  }, []);

  const updateName = useCallback((index: number, name: string) => {
    setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, suggestedName: name } : s));
  }, []);

  const toggleAll = useCallback((accepted: boolean) => {
    setSuggestions(prev => prev.map(s => ({ ...s, accepted })));
  }, []);

  const handleApply = useCallback(() => {
    const updates = suggestions
      .filter(s => s.accepted)
      .map(s => ({ groupId: s.groupId, fileId: s.fileId, name: s.suggestedName }));
    onApply(updates);
    onClose();
  }, [suggestions, onApply, onClose]);

  const acceptedCount = suggestions.filter(s => s.accepted).length;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-lg max-h-[80vh]">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0">
          <span className="text-xl">🤖</span>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 text-sm">AI 名前提案</h2>
            <p className="text-xs text-gray-400">{targetEntries.length}件のファイルを分析</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold">✕</button>
        </div>

        {/* idle */}
        {stage === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
            <div className="text-5xl">📝</div>
            <div className="text-center">
              <p className="text-gray-700 font-medium mb-1">AIで自動的にファイル名を提案します</p>
              <p className="text-xs text-gray-400">各ファイルの1ページ目をGemini AIが分析します</p>
            </div>
            <button
              onClick={startAnalysis}
              className="bg-blue-600 text-white rounded-xl px-8 py-3 text-sm font-medium hover:bg-blue-700"
            >
              🔍 分析開始
            </button>
          </div>
        )}

        {/* rendering / analyzing */}
        {(stage === 'rendering' || stage === 'analyzing') && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-700">{progress.label}</p>
            {stage === 'rendering' && progress.total > 0 && (
              <div className="w-48">
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* error */}
        {stage === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <span className="text-4xl">⚠</span>
            <p className="text-sm text-red-600 font-medium text-center">{error}</p>
            <div className="flex gap-2">
              <button onClick={startAnalysis} className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm hover:bg-blue-700">再試行</button>
              <button onClick={onClose} className="border border-gray-300 rounded-lg px-6 py-2 text-sm text-gray-600 hover:bg-gray-50">閉じる</button>
            </div>
          </div>
        )}

        {/* preview */}
        {stage === 'preview' && (
          <>
            <div className="shrink-0 px-5 pt-3 flex items-center gap-2">
              <button onClick={() => toggleAll(true)} className="text-xs text-blue-600 hover:underline">全て選択</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => toggleAll(false)} className="text-xs text-blue-600 hover:underline">全て解除</button>
              <span className="ml-auto text-xs text-gray-400">{acceptedCount}件選択中</span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      s.accepted ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => toggleAccepted(i)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                        s.accepted ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-transparent'
                      }`}
                    >✓</button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 truncate mb-0.5">{s.originalName}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">→</span>
                        <input
                          type="text"
                          value={s.suggestedName}
                          onChange={(e) => updateName(i, e.target.value)}
                          className={`text-sm font-medium border-none outline-none bg-transparent flex-1 min-w-0 ${
                            s.accepted ? 'text-blue-700' : 'text-gray-400'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 px-5 py-3 border-t flex gap-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">キャンセル</button>
              <button
                onClick={handleApply}
                disabled={acceptedCount === 0}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                適用 ({acceptedCount}件)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
