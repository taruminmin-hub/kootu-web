import type { OutputFile } from '../utils/pdfProcessor';

interface Props {
  results: OutputFile[];
  warnings?: string[];
  onDownloadZip: () => void;
  onClose: () => void;
}

function downloadOne(file: OutputFile) {
  const blob = new Blob([file.data.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ResultModal({ results, warnings, onDownloadZip, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true" aria-label="処理完了">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-800">処理完了</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl" aria-label="閉じる">✕</button>
        </div>

        <p className="px-6 pt-3 pb-1 text-xs text-gray-500 shrink-0">
          {results.length} 件のPDFを処理しました。個別ダウンロードまたはZIPでまとめてダウンロードできます。
        </p>

        {/* 警告メッセージ（暗号化PDFなど） */}
        {warnings && warnings.length > 0 && (
          <div className="mx-6 mt-2 mb-1 p-3 bg-yellow-50 border border-yellow-200 rounded-lg shrink-0">
            <p className="text-xs font-semibold text-yellow-700 mb-1.5">⚠ 処理中の警告 ({warnings.length}件)</p>
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-700 leading-snug">{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-2">
          <div className="space-y-0.5">
            {results.map((file, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-gray-400 text-xs w-6 text-right shrink-0">{i + 1}.</span>
                <span className="flex-1 text-sm text-gray-700 break-all min-w-0">{file.name}</span>
                <button
                  onClick={() => downloadOne(file)}
                  className="shrink-0 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 whitespace-nowrap"
                >
                  ↓ DL
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            閉じる
          </button>
          <button
            onClick={onDownloadZip}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-1.5"
          >
            ZIP でダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
