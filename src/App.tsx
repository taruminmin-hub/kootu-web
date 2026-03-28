import { useState, useEffect } from 'react';
import {
  DndContext, closestCenter, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore } from './store/useStore';
import { useFileManagement } from './hooks/useFileManagement';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import FileGroupRow from './components/FileGroupRow';
import DropZone from './components/DropZone';
import SettingsModal from './components/SettingsModal';
import ProcessingOverlay from './components/ProcessingOverlay';
import ConfirmOutputModal from './components/ConfirmOutputModal';
import ResultModal from './components/ResultModal';
import AiSplitModal from './components/AiSplitModal';
import AiNameModal from './components/AiNameModal';
import PdfPreviewPanel from './components/PdfPreviewPanel';
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
  { value: '資料', label: '資料' },
  { value: '別紙', label: '別紙' },
  { value: 'custom', label: 'カスタム' },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const { groups, settings, updateSettings, clearAll, reorderGroups, moveGroupAsBranch, addFilesFromSplit, batchRename, undoSnapshot, undo, clearUndo } = useStore();
  const fm = useFileManagement();
  const isOnline = useOnlineStatus();

  const [showSettings, setShowSettings] = useState(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mainAreaDragOver, setMainAreaDragOver] = useState(false);

  // Undo スナックバーの自動非表示（8秒後）
  useEffect(() => {
    if (!undoSnapshot) return;
    const timer = setTimeout(() => clearUndo(), 8000);
    return () => clearTimeout(timer);
  }, [undoSnapshot, clearUndo]);

  // Google Fonts を Canvas で使えるよう preload
  useEffect(() => {
    document.fonts.load('bold 14px "Noto Serif JP"');
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (e: DragStartEvent) => {
    setDraggingGroupId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDraggingGroupId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith('branch-drop-')) {
      const targetGroupId = overId.replace('branch-drop-', '');
      moveGroupAsBranch(String(active.id), targetGroupId);
    } else {
      reorderGroups(String(active.id), overId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* ── ヘッダー ── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-4 md:gap-6 shadow-sm">
        {/* モバイル: ハンバーガーメニュー */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="md:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100"
          aria-label="メニューを開く"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-800 shrink-0">証拠番号付与アプリ</h1>

        <div className="hidden md:flex items-center gap-4 flex-wrap">
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

          <div className={`flex items-center gap-2 transition-opacity ${settings.numberless ? 'opacity-40 pointer-events-none' : ''}`}>
            <label className="text-sm text-gray-600 shrink-0">開始番号:</label>
            <input
              type="number"
              min={1}
              value={settings.startNumber}
              onChange={(e) => updateSettings({ startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-16 text-center"
            />
          </div>

          {/* 番号なしオプション */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.numberless}
              onChange={(e) => updateSettings({ numberless: e.target.checked })}
              className="accent-blue-600 w-4 h-4"
            />
            <span className="text-sm text-gray-600">番号なし</span>
          </label>
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

      <div className="flex flex-1 overflow-hidden relative">
        {/* モバイル: サイドバー背景オーバーレイ */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        {/* ── サイドバー ── */}
        <aside
          className={`w-52 bg-white border-r border-gray-200 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto transition-transform z-40 ${
            sidebarOpen ? 'fixed inset-y-0 left-0 top-[53px] translate-x-0 shadow-xl' : 'hidden md:flex'
          }`}
          role="navigation"
          aria-label="サイドバー"
        >
          {/* モバイル: 符号・開始番号設定 */}
          <div className="md:hidden space-y-2 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 shrink-0">符号:</label>
              <select
                value={settings.symbol}
                onChange={(e) => updateSettings({ symbol: e.target.value as SymbolType })}
                className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white flex-1"
              >
                {SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {settings.symbol === 'custom' && (
              <input
                type="text"
                value={settings.customSymbol}
                onChange={(e) => updateSettings({ customSymbol: e.target.value })}
                placeholder="例: 参"
                className="border border-gray-300 rounded px-1.5 py-1 text-xs w-full"
              />
            )}
            <div className={`flex items-center gap-2 transition-opacity ${settings.numberless ? 'opacity-40 pointer-events-none' : ''}`}>
              <label className="text-xs text-gray-600 shrink-0">開始番号:</label>
              <input
                type="number"
                min={1}
                value={settings.startNumber}
                onChange={(e) => updateSettings({ startNumber: Math.max(1, parseInt(e.target.value) || 1) })}
                className="border border-gray-300 rounded px-1.5 py-1 text-xs w-14 text-center"
              />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.numberless}
                onChange={(e) => updateSettings({ numberless: e.target.checked })}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600">番号なし</span>
            </label>
          </div>

          {/* ── 主要アクション ── */}
          <button
            onClick={fm.openFilePicker}
            className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            📁 ファイル追加
          </button>

          <button
            onClick={fm.handleProcessClick}
            disabled={!groups.length || fm.processing || fm.isCustomSymbolEmpty}
            className="bg-green-600 text-white rounded-lg px-4 py-3 text-sm font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm ring-1 ring-green-700/10"
            title={fm.isCustomSymbolEmpty ? 'カスタム符号を入力してください' : undefined}
          >
            📋 スタンプ付与
          </button>
          {fm.isCustomSymbolEmpty && (
            <p className="text-xs text-red-500">カスタム符号が未入力です</p>
          )}

          <hr className="border-gray-200" />

          {/* ── AI ツール ── */}
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI ツール</p>
          <button
            onClick={fm.openAiSplitPicker}
            disabled={!isOnline}
            className="bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            title={!isOnline ? 'オフラインのため利用できません' : undefined}
          >
            🤖 AI分割
          </button>

          <button
            onClick={() => fm.setShowAiName(true)}
            disabled={!groups.length || !isOnline}
            className="border border-purple-300 text-purple-700 rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            title={!isOnline ? 'オフラインのため利用できません' : undefined}
          >
            🤖 AI名前提案
          </button>
          {!isOnline && (
            <p className="text-[10px] text-gray-500">オフラインです</p>
          )}

          <hr className="border-gray-200" />

          {/* ── 管理 ── */}
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">管理</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => fm.setShowClearConfirm(true)}
              disabled={!groups.length}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              クリア
            </button>
            <button
              onClick={() => { fm.setSelectionMode((m) => !m); fm.setSelectedIds(new Set()); }}
              className={`flex-1 border rounded-lg px-2 py-1.5 text-xs ${fm.selectionMode ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              {fm.selectionMode ? '選択中...' : '選択削除'}
            </button>
          </div>
          {fm.selectionMode && fm.selectedIds.size > 0 && (
            <button
              onClick={fm.handleDeleteSelected}
              className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700"
            >
              削除 ({fm.selectedIds.size}件)
            </button>
          )}

          {fm.totalFiles > 0 && (
            <div className="mt-2 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-1">
              <div>ファイル数: <span className="font-bold text-gray-800">{fm.totalFiles}</span></div>
              <div className="text-xs text-gray-500">{formatSize(fm.totalSize)}</div>
            </div>
          )}

          {fm.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 leading-relaxed">
              ⚠ {fm.error}
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 leading-relaxed">
              💡 「枝番化」で直前の項目の枝番に統合。「主番号化」で独立。⠿ ドラッグで並び替え。
            </p>
          </div>
        </aside>

        {/* ── メインエリア（ファイル一覧 + プレビュー分割） ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左: ファイル一覧 */}
          <main
            className={`p-4 overflow-y-auto transition-all relative ${
              fm.previewFile ? 'w-1/2 lg:w-[45%]' : 'flex-1'
            }`}
            onDragOver={(e) => {
              if (groups.length > 0 && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setMainAreaDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
                setMainAreaDragOver(false);
              }
            }}
            onDrop={(e) => {
              if (groups.length > 0 && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setMainAreaDragOver(false);
                const files = Array.from(e.dataTransfer.files);
                fm.handleAddFiles(files);
              }
            }}
          >
            {/* ドラッグ中のオーバーレイ */}
            {mainAreaDragOver && groups.length > 0 && (
              <div className="absolute inset-0 bg-blue-50/80 border-2 border-dashed border-blue-400 rounded-xl z-20 flex items-center justify-center pointer-events-none">
                <p className="text-blue-600 font-medium text-sm">ファイルをドロップして追加</p>
              </div>
            )}
            {groups.length === 0 ? (
              <DropZone onDrop={fm.handleAddFiles} />
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
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
                          selectionMode={fm.selectionMode}
                          selectedIds={fm.selectedIds}
                          onToggleSelect={fm.toggleSelect}
                          draggingGroupId={draggingGroupId}
                          previewingFileId={fm.previewFile?.fileId}
                          onPreviewSelect={fm.handlePreviewSelect}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {draggingGroupId ? (() => {
                      const g = groups.find(g => g.id === draggingGroupId);
                      if (!g) return null;
                      return (
                        <div className="bg-white border-2 border-blue-400 rounded-xl p-3 shadow-xl opacity-80 w-[200px]">
                          <div className="text-sm font-medium text-gray-700 truncate">{g.mainFile.file.name}</div>
                          {g.branchFiles.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">+ {g.branchFiles.length} 枝番</div>
                          )}
                        </div>
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
                <div className="mt-3">
                  <DropZone onDrop={fm.handleAddFiles} compact />
                </div>
              </>
            )}
          </main>

          {/* 右: PDFプレビューパネル（デスクトップ: サイドパネル） */}
          {fm.previewFile && (
            <aside className="w-1/2 lg:w-[55%] border-l border-gray-200 bg-white hidden md:block">
              <PdfPreviewPanel
                key={fm.previewFile.fileId}
                file={fm.previewFile.file}
                label={fm.previewFile.label}
                customOutputName={fm.previewFile.customOutputName}
                customStampPosition={fm.previewFile.customStampPosition}
                rotation={fm.previewFile.rotation}
                settings={settings}
                onClose={() => fm.setPreviewFile(null)}
                onReplaceFile={fm.handlePreviewReplaceFile}
                onSplitFile={fm.handlePreviewSplitFile}
                onSavePosition={(pos) => {
                  const { setCustomStampPosition } = useStore.getState();
                  setCustomStampPosition(fm.previewFile!.groupId, fm.previewFile!.fileId, pos);
                  fm.setPreviewFile(prev => prev ? { ...prev, customStampPosition: pos } : null);
                }}
                onResetPosition={() => {
                  const { setCustomStampPosition } = useStore.getState();
                  setCustomStampPosition(fm.previewFile!.groupId, fm.previewFile!.fileId, undefined);
                  fm.setPreviewFile(prev => prev ? { ...prev, customStampPosition: undefined } : null);
                }}
              />
            </aside>
          )}
          {/* モバイル: プレビューフルスクリーンモーダル */}
          {fm.previewFile && (
            <div className="fixed inset-0 z-50 bg-white md:hidden flex flex-col" role="dialog" aria-modal="true" aria-label="PDFプレビュー">
              <PdfPreviewPanel
                key={`mobile-${fm.previewFile.fileId}`}
                file={fm.previewFile.file}
                label={fm.previewFile.label}
                customOutputName={fm.previewFile.customOutputName}
                customStampPosition={fm.previewFile.customStampPosition}
                rotation={fm.previewFile.rotation}
                settings={settings}
                onClose={() => fm.setPreviewFile(null)}
                onReplaceFile={fm.handlePreviewReplaceFile}
                onSplitFile={fm.handlePreviewSplitFile}
                onSavePosition={(pos) => {
                  const { setCustomStampPosition } = useStore.getState();
                  setCustomStampPosition(fm.previewFile!.groupId, fm.previewFile!.fileId, pos);
                  fm.setPreviewFile(prev => prev ? { ...prev, customStampPosition: pos } : null);
                }}
                onResetPosition={() => {
                  const { setCustomStampPosition } = useStore.getState();
                  setCustomStampPosition(fm.previewFile!.groupId, fm.previewFile!.fileId, undefined);
                  fm.setPreviewFile(prev => prev ? { ...prev, customStampPosition: undefined } : null);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {fm.processing && <ProcessingOverlay current={fm.progress.current} total={fm.progress.total} currentFileName={fm.progress.currentFileName} />}
      {fm.converting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="変換中">
          <div className="bg-white rounded-2xl shadow-2xl p-6 flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-sm font-medium text-gray-700">画像を PDF に変換中…</p>
          </div>
        </div>
      )}
      {fm.showConfirm && (
        <ConfirmOutputModal
          fileNames={fm.confirmFileNames}
          onConfirm={fm.handleConfirmProcess}
          onCancel={() => fm.setShowConfirm(false)}
        />
      )}
      {fm.processedResults && !fm.processing && (
        <ResultModal
          results={fm.processedResults.files}
          warnings={fm.processedResults.warnings}
          onDownloadZip={fm.handleDownloadZip}
          onClose={() => fm.setProcessedResults(null)}
        />
      )}
      {fm.showAiSplit && fm.aiSplitFile && (
        <AiSplitModal
          file={fm.aiSplitFile}
          onComplete={(files) => addFilesFromSplit(files)}
          onClose={() => { fm.setShowAiSplit(false); fm.setAiSplitFile(null); }}
        />
      )}
      {fm.showAiName && (
        <AiNameModal
          groups={groups}
          onApply={(updates) => batchRename(updates)}
          onClose={() => fm.setShowAiName(false)}
        />
      )}
      {fm.showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          role="dialog" aria-modal="true" aria-label="リストクリアの確認">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs">
            <p className="text-sm font-medium text-gray-800 mb-1">リストをクリアしますか？</p>
            <p className="text-xs text-gray-500 mb-4">すべてのファイルが削除されます。「元に戻す」で復元可能です。</p>
            <div className="flex gap-2">
              <button
                onClick={() => fm.setShowClearConfirm(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => { clearAll(); fm.setShowClearConfirm(false); }}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700"
              >
                クリア
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo スナックバー */}
      {undoSnapshot && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-slide-up">
          <span className="text-sm">{undoSnapshot.label}</span>
          <button
            onClick={undo}
            className="text-sm font-bold text-blue-300 hover:text-blue-100 underline underline-offset-2"
          >
            元に戻す
          </button>
          <button
            onClick={clearUndo}
            className="text-gray-400 hover:text-white text-xs ml-1"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
