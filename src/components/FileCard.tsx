import { useState, useRef, useEffect } from 'react';
import { usePdfThumbnail } from '../hooks/usePdfThumbnail';
import StampPositionModal from './StampPositionModal';
import type { StampPosition, Settings } from '../types';

interface Props {
  label: string;
  file: File;
  customOutputName?: string;
  customStampPosition?: StampPosition;
  rotation: 0 | 90 | 180 | 270;
  isBranch: boolean;
  settings: Settings;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onRemove: () => void;
  onMakeBranch?: () => void;
  onMakeMain?: () => void;
  onRenameOutput?: (name: string) => void;
  onSavePosition?: (pos: StampPosition) => void;
  onResetPosition?: () => void;
  onRotate?: (rotation: 0 | 90 | 180 | 270) => void;
}

export default function FileCard({
  label, file, customOutputName, customStampPosition, rotation, isBranch, settings,
  selectionMode, isSelected, onToggleSelect,
  onRemove, onMakeBranch, onMakeMain,
  onRenameOutput, onSavePosition, onResetPosition, onRotate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showPositionModal, setShowPositionModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnail = usePdfThumbnail(file, 120);

  const startEdit = () => {
    setDraft(customOutputName || file.name.replace(/\.[^.]+$/, ''));
    setEditing(true);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = () => {
    onRenameOutput?.(draft.trim());
    setEditing(false);
  };

  const rotateCW = () => {
    const next = ((rotation + 90) % 360) as 0 | 90 | 180 | 270;
    onRotate?.(next);
  };
  const rotateCCW = () => {
    const next = ((rotation + 270) % 360) as 0 | 90 | 180 | 270;
    onRotate?.(next);
  };

  const displayName = customOutputName?.trim()
    ? `${customOutputName.trim()}.pdf`
    : file.name;
  const shortName = displayName.length > 26 ? displayName.slice(0, 24) + '…' : displayName;
  const hasCustomPos = !!customStampPosition;

  // サムネイルの CSS 回転（90°/270° 時はスケールダウンして収める）
  const thumbStyle: React.CSSProperties = rotation
    ? {
        transform: `rotate(${rotation}deg) scale(${rotation % 180 !== 0 ? 0.62 : 1})`,
        transition: 'transform 0.25s ease',
      }
    : {};

  return (
    <>
      <div className={`bg-white border rounded-lg overflow-hidden shadow-sm flex flex-col w-[160px] transition-all ${
        selectionMode && isSelected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'
      }`}>
        {/* サムネイル */}
        <div className="h-[100px] bg-gray-100 flex items-center justify-center overflow-hidden relative">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="PDF preview"
              className="w-full h-full object-contain"
              style={thumbStyle}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-300" style={thumbStyle}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px]">PDF</span>
            </div>
          )}
          {/* スタンプラベル（右上オーバーレイ） */}
          <div className="absolute top-1 right-1 bg-red-600 text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
            {label}
          </div>
          {/* 回転ボタン */}
          <div className="absolute bottom-1 right-1 flex gap-0.5">
            <button
              onClick={rotateCCW}
              className="bg-black/40 hover:bg-black/60 text-white rounded text-[10px] w-5 h-5 flex items-center justify-center leading-none"
              title="反時計回りに90°回転"
            >↺</button>
            <button
              onClick={rotateCW}
              className="bg-black/40 hover:bg-black/60 text-white rounded text-[10px] w-5 h-5 flex items-center justify-center leading-none"
              title="時計回りに90°回転"
            >↻</button>
          </div>
          {/* カスタム位置バッジ */}
          {hasCustomPos && (
            <div className="absolute bottom-1 left-1 bg-orange-500 text-white text-[8px] px-1 rounded leading-none">
              位置調整済
            </div>
          )}
          {/* 回転バッジ */}
          {rotation !== 0 && !selectionMode && (
            <div className="absolute top-1 left-1 bg-blue-600 text-white text-[8px] px-1 rounded leading-none">
              {rotation}°
            </div>
          )}
          {/* 選択チェックボックス */}
          {selectionMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
              className={`absolute top-1 left-1 z-20 w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white/80 border-gray-400 text-transparent'
              }`}
              title={isSelected ? '選択解除' : '選択'}
            >
              ✓
            </button>
          )}
        </div>

        {/* ファイル情報エリア */}
        <div className="p-2 flex flex-col gap-1.5">
          {/* ファイル名（ダブルクリックで編集） */}
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="text-xs border border-blue-400 rounded px-1.5 py-0.5 w-full outline-none"
              placeholder="出力ファイル名"
            />
          ) : (
            <div
              className={`text-xs leading-tight cursor-text ${
                customOutputName?.trim() ? 'text-blue-700 font-medium' : 'text-gray-600'
              }`}
              title={`ダブルクリックで出力ファイル名を編集\n元ファイル: ${file.name}`}
              onDoubleClick={startEdit}
            >
              {shortName}
            </div>
          )}

          {/* アクションボタン行1 */}
          <div className="flex items-center gap-1">
            {isBranch ? (
              <button onClick={onMakeMain}
                className="text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-200 rounded px-1.5 py-0.5 font-medium">
                主番号化
              </button>
            ) : (
              onMakeBranch && (
                <button onClick={onMakeBranch}
                  className="text-[10px] bg-green-100 text-green-700 hover:bg-green-200 rounded px-1.5 py-0.5 font-medium">
                  枝番化
                </button>
              )
            )}
            <button onClick={onRemove}
              className="ml-auto text-gray-400 hover:text-red-500 text-xs" title="削除">
              🗑
            </button>
          </div>

          {/* アクションボタン行2 */}
          <div className="flex gap-1">
            <button onClick={startEdit}
              className="flex-1 text-[10px] text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-1 py-0.5 text-center"
              title="出力ファイル名を編集">
              ✏ ファイル名
            </button>
            <button
              onClick={() => setShowPositionModal(true)}
              className={`flex-1 text-[10px] border rounded px-1 py-0.5 text-center ${
                hasCustomPos
                  ? 'text-orange-600 border-orange-300 hover:bg-orange-50'
                  : 'text-gray-500 border-gray-200 hover:text-blue-600'
              }`}
              title="スタンプ位置を調整"
            >
              📍 位置
            </button>
          </div>
        </div>
      </div>

      {showPositionModal && (
        <StampPositionModal
          file={file}
          stampLabel={label}
          settings={settings}
          initialPosition={customStampPosition}
          rotation={rotation}
          onSave={(pos) => { onSavePosition?.(pos); }}
          onReset={() => { onResetPosition?.(); }}
          onClose={() => setShowPositionModal(false)}
        />
      )}
    </>
  );
}
