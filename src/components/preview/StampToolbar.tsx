import type { StampColor, StampPosition, Settings } from '../../types';

interface Props {
  stampEditing: boolean;
  setStampEditing: (v: boolean) => void;
  pos: StampPosition;
  stampColor: StampColor;
  setStampColor: (c: StampColor) => void;
  stampFontSize: number;
  setStampFontSize: (fn: (prev: number) => number) => void;
  setStampStyleChanged: (v: boolean) => void;
  anyStampChanged: boolean;
  customStampPosition?: StampPosition;
  settings: Settings;
  onSave: () => void;
  onReset: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
}

export default function StampToolbar({
  stampEditing, pos, stampColor, setStampColor, stampFontSize, setStampFontSize,
  setStampStyleChanged, anyStampChanged, customStampPosition,
  onSave, onReset, onCancel, onStartEdit,
}: Props) {
  return (
    <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap">
      {!stampEditing ? (
        <button
          onClick={onStartEdit}
          className="text-xs text-orange-600 hover:text-orange-800 border border-orange-200 rounded px-2.5 py-1 hover:bg-orange-50 font-medium"
        >
          📍 スタンプ位置
        </button>
      ) : (
        <>
          <span className="text-xs text-orange-600 font-medium">📍 スタンプ編集</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={onReset} className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100">
              リセット
            </button>
            <button onClick={onSave} disabled={!anyStampChanged} className="text-[10px] text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded px-2.5 py-0.5 font-medium">
              保存
            </button>
            <button onClick={onCancel} className="text-[10px] text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
        </>
      )}
      {stampEditing && (
        <div className="w-full flex items-center gap-3 mt-1 flex-wrap">
          {/* 色 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">色:</span>
            {(['red', 'blue', 'black'] as StampColor[]).map(c => (
              <button
                key={c}
                onClick={() => { setStampColor(c); setStampStyleChanged(true); }}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  stampColor === c ? 'border-gray-800 scale-110' : 'border-gray-300 hover:border-gray-500'
                }`}
                style={{ backgroundColor: c === 'red' ? '#dc2626' : c === 'blue' ? '#2563eb' : '#1f2937' }}
                title={c === 'red' ? '赤' : c === 'blue' ? '青' : '黒'}
              />
            ))}
          </div>
          {/* サイズ */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">サイズ:</span>
            <button
              onClick={() => { setStampFontSize(f => Math.max(6, f - 1)); setStampStyleChanged(true); }}
              className="w-5 h-5 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100"
            >−</button>
            <span className="text-[10px] text-gray-700 font-medium w-8 text-center">{stampFontSize}pt</span>
            <button
              onClick={() => { setStampFontSize(f => Math.min(36, f + 1)); setStampStyleChanged(true); }}
              className="w-5 h-5 flex items-center justify-center border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100"
            >+</button>
          </div>
          {/* 位置 */}
          <span className="text-[10px] text-gray-500">
            位置: 上{pos.marginTop}pt / 右{pos.marginRight}pt — ドラッグで移動
          </span>
        </div>
      )}
      {!!customStampPosition && !stampEditing && (
        <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">位置調整済</span>
      )}
    </div>
  );
}
