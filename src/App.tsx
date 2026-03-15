import { useState, useCallback, useEffect } from 'react';
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from './store/useStore';
import { processAllFiles, downloadAsZip } from './utils/pdfProcessor';
import FileGroupRow from './components/FileGroupRow';
import DropZone from './components/DropZone';
import SettingsModal from './components/SettingsModal';
import ProcessingOverlay from './components/ProcessingOverlay';
import type { SymbolType } from './types';

const SYMBOLS: { value: SymbolType; label: string }[] = [
  { value: '甲', label: '甲' },
  { value: '乙', label: '乙' },
  { value: '丙', label: '丙' },
  { value: '丁', label: '丁' },
  { value: '戊', label: '戊' },
  { value: '疎甲', label: '疎甲' },
  { value: '疎乙', label: '疎乙' },
  { value: '弁', label: '弁' },
  { value: '疎料', label: '疎料' },
  { value: '別紙', label: '別紙' },
  { value: 'custom', label: 'カスタム' },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const { groups, settings, addFiles, reorderGroups, updateSettings, clearAll } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Google Fonts を Canvas で使えるよう preload
  useEffect(() => {
    document.fonts.load('bold 14px "Noto Serif JP"');
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const totalFiles = groups.reduce((s, g) => s + 1 + g.branchFiles.length, 0);
  const totalSize = groups.reduce((s, g) => {
    let n = g.mainFile.file.size;
    g.branchFiles.forEach((f) => (n += f.file.size));
    return s + n;
  }, 0);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) reorderGroups(String(active.id), String(over.id));
  };

  const openFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length) addFiles(files);
    };
    input.click();
  }, [addFiles]);

  const handleProcess = async () => {
    if (!groups.length) return;
    setProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 0 });
    try {
      const results = await processAllFiles(groups, settings, (cur, tot) =>
        setProgress({ current: cur, total: tot }),
      );
      await downloadAsZip(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理中にエラーが発生しました');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* ── ヘッダー ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 shadow-sm">
        <h1 className="text-base font-bold text-gray-800 shrink-0">甲乙つけるくん Web版</h1>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 shrink-0">符号:</label>
            <select
              value={settings.symbol}
              onChange={(e) => updateSettings({ symbol: e.target.value as SymbolType })}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            >
              {SYMBOLS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {settings.symbol === 'custom' && (
              <input
                type="text"
                value={settings.customSymbol}
                onChange={(e) => updateSettings({ customSymbol: e.target.value })}
                placeholder="例: 参"
                className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 shrink-0">開始番号:</label>
            <input
              type="number"
              min={1}
              value={settings.startNumber}
              onChange={(e) => updateSettings({ startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-16 text-center"
            />
          </div>
        </div>

        <div className="ml-auto shrink-0">
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5"
          >
            ⚙ 設定
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── サイドバー ── */}
        <aside className="w-52 bg-white border-r border-gray-200 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
          <button
            onClick={openFilePicker}
            className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            📁 ファイル追加
          </button>

          <button
            onClick={handleProcess}
            disabled={!groups.length || processing}
            className="bg-green-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            📋 PDFにスタンプ付与
          </button>

          <button
            onClick={clearAll}
            disabled={!groups.length}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            リストクリア
          </button>

          {totalFiles > 0 && (
            <div className="mt-2 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-1">
              <div>ファイル数: <span className="font-bold text-gray-800">{totalFiles}</span></div>
              <div className="text-xs text-gray-400">{formatSize(totalSize)}</div>
            </div>
          )}

          {error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 leading-relaxed">
              ⚠ {error}
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 leading-relaxed">
              💡 「枝番化」で直前の項目の枝番に統合。「主番号化」で独立。⠿ ドラッグで並び替え。
            </p>
          </div>
        </aside>

        {/* ── メインエリア ── */}
        <main className="flex-1 p-4 overflow-y-auto">
          {groups.length === 0 ? (
            <DropZone onDrop={addFiles} />
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={groups.map((g) => g.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {groups.map((group, i) => (
                      <FileGroupRow
                        key={group.id}
                        group={group}
                        index={i}
                        settings={settings}
                        isFirst={i === 0}
                        isLast={i === groups.length - 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="mt-3">
                <DropZone onDrop={addFiles} compact />
              </div>
            </>
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {processing && <ProcessingOverlay current={progress.current} total={progress.total} />}
    </div>
  );
}
