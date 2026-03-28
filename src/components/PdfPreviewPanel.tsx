import { usePdfAllPages } from '../hooks/usePdfAllPages';

interface Props {
  file: File;
  label: string;
  customOutputName?: string;
  onClose: () => void;
  onOpenEdit: () => void;
}

export default function PdfPreviewPanel({
  file, label, customOutputName, onClose, onOpenEdit,
}: Props) {
  const { pages, loading } = usePdfAllPages(file, 800);
  const displayName = customOutputName?.trim() || file.name.replace(/\.[^.]+$/, '');
  const totalPages = pages.length;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ヘッダー */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 flex items-center gap-3">
        <div className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          {label}
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={displayName}
            readOnly
            className="text-sm text-gray-700 font-medium bg-transparent border-none outline-none w-full truncate"
            title={file.name}
          />
        </div>
        <button
          onClick={onOpenEdit}
          className="shrink-0 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
          title="ページ編集モードを開く"
        >
          ✏ 編集
        </button>
        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded text-sm"
          title="プレビューを閉じる"
        >
          ✕
        </button>
      </div>

      {/* プレビュー本体 */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
        {loading && pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            {pages.map((dataUrl, i) => (
              <div key={i} className="relative">
                <img
                  src={dataUrl}
                  alt={`ページ ${i + 1}`}
                  className="w-full shadow-md rounded-sm bg-white"
                />
                {/* ページ番号バッジ */}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                  {i + 1} / {totalPages || '?'}
                </div>
                {/* スタンプラベル（1ページ目のみ） */}
                {i === 0 && (
                  <div className="absolute top-3 right-3 border-2 border-red-600 text-red-600 text-sm font-bold px-2 py-1 rounded bg-white/80">
                    {label}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-center py-4">
                <div className="inline-block w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* フッター: ページナビ */}
      {totalPages > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>{totalPages} ページ</span>
          <span className="text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
        </div>
      )}
    </div>
  );
}
