interface Props {
  fileNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmOutputModal({ fileNames, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true" aria-label="出力ファイル確認">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">出力ファイル確認</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <p className="px-6 pt-3 pb-1 text-xs text-gray-500 shrink-0">
          以下 {fileNames.length} 件のファイルが出力されます。確認してください。
        </p>
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <div className="space-y-0.5">
            {fileNames.map((name, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-gray-400 text-xs w-6 text-right shrink-0">{i + 1}.</span>
                <span className="text-sm text-gray-700 break-all">{name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700"
          >
            ダウンロード開始
          </button>
        </div>
      </div>
    </div>
  );
}
