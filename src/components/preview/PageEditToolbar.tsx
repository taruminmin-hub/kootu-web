interface Props {
  viewMode: 'single' | 'grid';
  stampEditing: boolean;
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
}

export default function PageEditToolbar({
  viewMode, stampEditing, totalPages,
  selectedPages, selectedArr, selectionSummary,
  canDelete, canSplit, singleSelected,
  editProcessing, editConfirm, setEditConfirm,
  onRotate, onDelete, onSplit,
  onSelectAll, onDeselectAll,
}: Props) {
  if (stampEditing) return null;

  return (
    <>
      <div className="px-4 py-1.5 border-t border-gray-100 flex items-center gap-2 flex-wrap">
        {viewMode === 'grid' && (
          <button
            onClick={selectedPages.size === totalPages ? onDeselectAll : onSelectAll}
            disabled={totalPages === 0}
            className="text-[10px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
          >
            {selectedPages.size === totalPages ? '選択解除' : '全選択'}
          </button>
        )}

        {selectedPages.size > 0 && (
          <>
            <span className="text-xs text-blue-600 font-medium">{selectionSummary} 選択中</span>
            <span className="text-gray-300">|</span>
            <button
              onClick={onRotate}
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
              onClick={onDeselectAll}
              className="text-[10px] text-gray-400 hover:text-gray-600 ml-auto"
              title="選択解除"
            >
              ✕
            </button>
          </>
        )}
        {selectedPages.size === 0 && (
          <span className="text-[10px] text-gray-500">
            {viewMode === 'grid'
              ? 'クリックで選択 / Ctrl+クリック・Shift+矢印で複数選択 / ドラッグで並び替え'
              : '← → でページ送り / クリックで選択して編集'}
          </span>
        )}
      </div>

      {/* 確認パネル */}
      {editConfirm === 'delete' && selectedPages.size > 0 && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 flex items-center gap-3">
          <span className="text-xs text-red-700 font-medium">
            {selectedPages.size === 1 ? `ページ ${selectedArr[0] + 1} を削除しますか？` : `${selectedPages.size}ページを削除しますか？`}
          </span>
          <button onClick={onDelete} disabled={editProcessing} className="text-xs bg-red-600 text-white rounded px-3 py-1 font-medium hover:bg-red-700 disabled:opacity-50">
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
          <button onClick={onSplit} disabled={editProcessing} className="text-xs bg-orange-500 text-white rounded px-3 py-1 font-medium hover:bg-orange-600 disabled:opacity-50">
            分割する
          </button>
          <button onClick={() => setEditConfirm(null)} className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-white">
            キャンセル
          </button>
        </div>
      )}
    </>
  );
}
