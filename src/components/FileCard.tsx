interface Props {
  label: string;
  fileName: string;
  isBranch: boolean;
  onRemove: () => void;
  onMakeBranch?: () => void;
  onMakeMain?: () => void;
}

export default function FileCard({
  label, fileName, isBranch,
  onRemove, onMakeBranch, onMakeMain,
}: Props) {
  const shortName =
    fileName.length > 28 ? fileName.slice(0, 26) + '…' : fileName;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-[160px] max-w-[220px] shadow-sm flex flex-col gap-1.5">
      {/* ラベル */}
      <div className={`text-xs font-bold ${isBranch ? 'text-blue-600' : 'text-blue-700'}`}>
        {label}
      </div>

      {/* ファイル名 */}
      <div className="text-xs text-gray-600 leading-tight min-h-[2rem]" title={fileName}>
        {shortName}
      </div>

      {/* アクションボタン */}
      <div className="flex items-center gap-1 flex-wrap">
        {isBranch ? (
          <button
            onClick={onMakeMain}
            className="text-[11px] bg-blue-100 text-blue-700 hover:bg-blue-200 rounded px-2 py-0.5 font-medium"
          >
            主番号化
          </button>
        ) : (
          onMakeBranch && (
            <button
              onClick={onMakeBranch}
              className="text-[11px] bg-green-100 text-green-700 hover:bg-green-200 rounded px-2 py-0.5 font-medium"
            >
              枝番化
            </button>
          )
        )}
        <button
          onClick={onRemove}
          className="ml-auto text-gray-400 hover:text-red-500 text-xs px-1"
          title="削除"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
