import { useCallback } from 'react';
import type { AnnotationTool, AnnotationStyle } from '../../types/annotation';
import type { StampColor, StampPosition, Settings } from '../../types';

/* ── ツールボタン定義 ── */
const TOOL_GROUPS: { tools: { id: AnnotationTool; icon: string; label: string }[]; separator?: boolean }[] = [
  {
    tools: [
      { id: 'select', icon: '⇱', label: '選択' },
      { id: 'text', icon: 'T', label: 'テキスト' },
    ],
  },
  {
    separator: true,
    tools: [
      { id: 'rect', icon: '□', label: '矩形' },
      { id: 'ellipse', icon: '○', label: '楕円' },
      { id: 'arrow', icon: '→', label: '矢印' },
    ],
  },
  {
    separator: true,
    tools: [
      { id: 'freehand', icon: '✎', label: 'ペン' },
      { id: 'highlight', icon: '▬', label: 'ハイライト' },
      { id: 'line', icon: '─', label: '直線' },
    ],
  },
  {
    separator: true,
    tools: [
      { id: 'redaction', icon: '█', label: '墨消し' },
    ],
  },
];

interface Props {
  /* ── アノテーションツール ── */
  activeTool: AnnotationTool;
  setActiveTool: (t: AnnotationTool) => void;
  style: AnnotationStyle;
  onStyleChange: (patch: Partial<AnnotationStyle>) => void;
  annotationCount: number;
  onApplyAnnotations: () => void;
  onClearAnnotations: () => void;

  /* ── ズーム ── */
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;

  /* ── スタンプ編集 ── */
  stampEditing: boolean;
  onStartStampEdit: () => void;
  onSaveStamp: () => void;
  onResetStamp: () => void;
  onCancelStamp: () => void;
  anyStampChanged: boolean;
  customStampPosition?: StampPosition;
  pos: StampPosition;
  stampColor: StampColor;
  setStampColor: (c: StampColor) => void;
  stampFontSize: number;
  setStampFontSize: (fn: (prev: number) => number) => void;
  setStampStyleChanged: (v: boolean) => void;

  /* ── ページ編集 ── */
  viewMode: 'single' | 'grid';
  totalPages: number;
  selectedPages: Set<number>;
  selectedArr: number[];
  selectionSummary: string;
  canDelete: boolean;
  canSplit: boolean;
  singleSelected: number | null;
  editProcessing: boolean;
  editConfirm: 'delete' | 'split' | null;
  setEditConfirm: (v: 'delete' | 'split' | null) => void;
  onRotate: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;

  settings: Settings;
}

export default function EditorToolbar({
  activeTool, setActiveTool, style, onStyleChange,
  annotationCount, onApplyAnnotations, onClearAnnotations,
  zoomPercent, onZoomIn, onZoomOut, onZoomFit,
  stampEditing, onStartStampEdit, onSaveStamp, onResetStamp, onCancelStamp,
  anyStampChanged, customStampPosition, pos,
  stampColor, setStampColor, stampFontSize, setStampFontSize, setStampStyleChanged,
  viewMode, totalPages, selectedPages, selectedArr, selectionSummary,
  canDelete, canSplit, singleSelected, editProcessing, editConfirm, setEditConfirm,
  onRotate, onDelete, onSplit, onSelectAll, onDeselectAll,
}: Props) {

  const handleToolClick = useCallback((tool: AnnotationTool) => {
    setActiveTool(tool);
  }, [setActiveTool]);

  const isAnnotationMode = activeTool !== 'select';

  return (
    <div className="shrink-0 border-b border-gray-200 bg-gray-50">
      {/* メインツールバー（1行） */}
      <div className="px-2 py-1 flex items-center gap-0.5 flex-wrap">
        {/* ツールアイコン群 */}
        {TOOL_GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center">
            {group.separator && <div className="w-px h-5 bg-gray-300 mx-1" />}
            {group.tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool.id)}
                disabled={stampEditing}
                className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors
                  ${activeTool === tool.id
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'}
                  ${stampEditing ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={tool.label}
              >
                {tool.icon}
              </button>
            ))}
          </div>
        ))}

        {/* ズームコントロール */}
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <div className="flex items-center gap-0.5">
          <button
            onClick={onZoomOut}
            disabled={stampEditing}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            title="縮小"
          >−</button>
          <button
            onClick={onZoomFit}
            disabled={stampEditing}
            className="h-6 px-1 rounded text-[10px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 min-w-[36px] text-center"
            title="フィット表示"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={onZoomIn}
            disabled={stampEditing}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            title="拡大"
          >+</button>
        </div>

        {/* スタイル：線 ON/OFF + 色 */}
        {isAnnotationMode && !stampEditing && activeTool !== 'redaction' && (
          <>
            <div className="w-px h-5 bg-gray-300 mx-1" />
            {/* 線 ON/OFF（ハイライト以外） */}
            {activeTool !== 'highlight' && (
              <>
                <button
                  onClick={() => onStyleChange({ strokeEnabled: !style.strokeEnabled })}
                  className={`h-6 px-1.5 rounded text-[10px] font-medium border ${
                    style.strokeEnabled ? 'bg-white border-gray-300 text-gray-700' : 'bg-gray-100 border-gray-200 text-gray-400'
                  }`}
                  title="線の表示"
                >
                  線
                </button>
                {style.strokeEnabled && (
                  <div className="relative ml-0.5">
                    <label className="w-6 h-6 rounded border border-gray-300 block cursor-pointer overflow-hidden" title="線の色">
                      <input
                        type="color"
                        value={style.strokeColor}
                        onChange={e => onStyleChange({ strokeColor: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: style.strokeColor }} />
                    </label>
                  </div>
                )}
              </>
            )}

            {/* 線幅 */}
            {(activeTool !== 'text' && activeTool !== 'highlight') && style.strokeEnabled && (
              <div className="flex items-center gap-0.5 ml-1">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={style.lineWidth}
                  onChange={e => onStyleChange({ lineWidth: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                  className="w-10 h-6 text-[10px] text-center border border-gray-300 rounded bg-white"
                  title="線の太さ (pt)"
                />
                <span className="text-[10px] text-gray-400">pt</span>
              </div>
            )}

            {/* 線スタイルプリセット */}
            {style.strokeEnabled && (
              <select
                value={style.lineWidth}
                onChange={e => onStyleChange({ lineWidth: parseInt(e.target.value) })}
                className="h-6 text-[10px] border border-gray-300 rounded bg-white text-gray-600 px-0.5"
                title="線の太さ"
              >
                <option value={1}>──</option>
                <option value={2}>━━</option>
                <option value={4}>━━━</option>
              </select>
            )}

            <div className="w-px h-5 bg-gray-300 mx-1" />

            {/* 塗り ON/OFF */}
            {(activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'highlight') && (
              <>
                <button
                  onClick={() => onStyleChange({ fillEnabled: !style.fillEnabled })}
                  className={`h-6 px-1.5 rounded text-[10px] font-medium border ${
                    style.fillEnabled ? 'bg-white border-gray-300 text-gray-700' : 'bg-gray-100 border-gray-200 text-gray-400'
                  }`}
                  title="塗りの表示"
                >
                  塗り
                </button>
                {style.fillEnabled && (
                  <div className="relative ml-0.5">
                    <label className="w-6 h-6 rounded border border-gray-300 block cursor-pointer overflow-hidden" title="塗りの色">
                      <input
                        type="color"
                        value={style.fillColor}
                        onChange={e => onStyleChange({ fillColor: e.target.value })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: style.fillColor }} />
                    </label>
                  </div>
                )}
              </>
            )}

            {/* 不透明度 */}
            {(activeTool === 'highlight' || style.fillEnabled) && (
              <div className="flex items-center gap-0.5 ml-1">
                <input
                  type="number"
                  min={10}
                  max={100}
                  step={10}
                  value={Math.round(style.opacity * 100)}
                  onChange={e => onStyleChange({ opacity: Math.max(0.1, Math.min(1, parseInt(e.target.value) / 100 || 1)) })}
                  className="w-12 h-6 text-[10px] text-center border border-gray-300 rounded bg-white"
                  title="不透明度"
                />
                <span className="text-[10px] text-gray-400">%</span>
              </div>
            )}
          </>
        )}

        {/* 注釈 適用/クリア */}
        {annotationCount > 0 && !stampEditing && (
          <>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500">{annotationCount}件</span>
              <button
                onClick={onApplyAnnotations}
                disabled={editProcessing}
                className="text-[10px] text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded px-2.5 py-1 font-medium"
              >
                適用
              </button>
              <button
                onClick={onClearAnnotations}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                クリア
              </button>
            </div>
          </>
        )}

        {/* スタンプ編集ボタン（ツールバー右端） */}
        {!stampEditing && annotationCount === 0 && (
          <div className="ml-auto flex items-center gap-1">
            {customStampPosition && (
              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">位置調整済</span>
            )}
            <button
              onClick={onStartStampEdit}
              className="text-[10px] text-orange-600 hover:text-orange-800 border border-orange-200 rounded px-2 py-1 hover:bg-orange-50 font-medium"
            >
              📍 スタンプ
            </button>
          </div>
        )}

        {/* スタンプ編集モード */}
        {stampEditing && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-orange-600 font-medium">📍 スタンプ編集</span>
            {/* 色 */}
            <div className="flex items-center gap-1">
              {(['red', 'blue', 'black'] as StampColor[]).map(c => (
                <button
                  key={c}
                  onClick={() => { setStampColor(c); setStampStyleChanged(true); }}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    stampColor === c ? 'border-gray-800 scale-110' : 'border-gray-300 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: c === 'red' ? '#dc2626' : c === 'blue' ? '#2563eb' : '#1f2937' }}
                  title={c === 'red' ? '赤' : c === 'blue' ? '青' : '黒'}
                />
              ))}
            </div>
            {/* サイズ */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => { setStampFontSize(f => Math.max(6, f - 1)); setStampStyleChanged(true); }}
                className="w-5 h-5 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100"
              >−</button>
              <span className="text-[10px] text-gray-700 font-medium w-6 text-center">{stampFontSize}</span>
              <button
                onClick={() => { setStampFontSize(f => Math.min(36, f + 1)); setStampStyleChanged(true); }}
                className="w-5 h-5 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100"
              >+</button>
            </div>
            <span className="text-[9px] text-gray-400">上{pos.marginTop}/右{pos.marginRight}</span>
            <button onClick={onResetStamp} className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-gray-100">
              リセット
            </button>
            <button onClick={onSaveStamp} disabled={!anyStampChanged} className="text-[10px] text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded px-2 py-0.5 font-medium">
              保存
            </button>
            <button onClick={onCancelStamp} className="text-[10px] text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ページ編集バー（選択時のみ表示） */}
      {!stampEditing && selectedPages.size > 0 && (
        <div className="px-2 py-1 border-t border-gray-100 flex items-center gap-1.5 text-[10px]">
          {viewMode === 'grid' && (
            <button
              onClick={selectedPages.size === totalPages ? onDeselectAll : onSelectAll}
              className="text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-gray-100"
            >
              {selectedPages.size === totalPages ? '全解除' : '全選択'}
            </button>
          )}
          <span className="text-blue-600 font-medium">{selectionSummary}</span>
          <button
            onClick={onRotate}
            disabled={editProcessing}
            className="text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50 disabled:opacity-40 font-medium"
          >
            ↻ 回転
          </button>
          <button
            onClick={() => editConfirm === 'delete' ? setEditConfirm(null) : setEditConfirm('delete')}
            disabled={editProcessing || !canDelete}
            className={`border rounded px-1.5 py-0.5 font-medium disabled:opacity-40 ${
              editConfirm === 'delete' ? 'text-red-700 border-red-400 bg-red-50' : 'text-red-600 hover:text-red-800 border-red-200 hover:bg-red-50'
            }`}
          >
            🗑 削除{selectedPages.size > 1 ? ` (${selectedPages.size})` : ''}
          </button>
          {singleSelected !== null && (
            <button
              onClick={() => editConfirm === 'split' ? setEditConfirm(null) : setEditConfirm('split')}
              disabled={editProcessing || !canSplit}
              className={`border rounded px-1.5 py-0.5 font-medium disabled:opacity-40 ${
                editConfirm === 'split' ? 'text-orange-700 border-orange-400 bg-orange-50' : 'text-orange-600 hover:text-orange-800 border-orange-200 hover:bg-orange-50'
              }`}
            >
              ✂ 分割
            </button>
          )}
          <button onClick={onDeselectAll} className="text-gray-400 hover:text-gray-600 ml-auto">✕</button>
        </div>
      )}

      {/* 確認パネル */}
      {editConfirm === 'delete' && selectedPages.size > 0 && (
        <div className="px-3 py-1.5 bg-red-50 border-t border-red-200 flex items-center gap-2 text-[11px]">
          <span className="text-red-700 font-medium">
            {selectedPages.size === 1 ? `p.${selectedArr[0] + 1} を削除？` : `${selectedPages.size}ページ削除？`}
          </span>
          <button onClick={onDelete} disabled={editProcessing} className="bg-red-600 text-white rounded px-2 py-0.5 font-medium hover:bg-red-700 disabled:opacity-50">
            削除
          </button>
          <button onClick={() => setEditConfirm(null)} className="border border-gray-300 rounded px-2 py-0.5 hover:bg-white">
            取消
          </button>
        </div>
      )}
      {editConfirm === 'split' && singleSelected !== null && (
        <div className="px-3 py-1.5 bg-orange-50 border-t border-orange-200 flex items-center gap-2 text-[11px]">
          <span className="text-orange-700 font-medium">
            p.1〜{singleSelected + 1} と p.{singleSelected + 2}〜{totalPages} に分割？
          </span>
          <button onClick={onSplit} disabled={editProcessing} className="bg-orange-500 text-white rounded px-2 py-0.5 font-medium hover:bg-orange-600 disabled:opacity-50">
            分割
          </button>
          <button onClick={() => setEditConfirm(null)} className="border border-gray-300 rounded px-2 py-0.5 hover:bg-white">
            取消
          </button>
        </div>
      )}
    </div>
  );
}
