import { useRef, useEffect, useState } from 'react';

interface Props {
  current: number;
  total: number;
}

export default function ProcessingOverlay({ current, total }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const startTimeRef = useRef<number>(Date.now());
  const [eta, setEta] = useState<string | null>(null);

  // 開始時刻をリセット
  useEffect(() => {
    startTimeRef.current = Date.now();
  }, [total]);

  // ETA 計算
  useEffect(() => {
    if (current <= 0 || total <= 0) {
      setEta(null);
      return;
    }
    const elapsed = Date.now() - startTimeRef.current;
    const perFile = elapsed / current;
    const remaining = perFile * (total - current);
    if (remaining < 1000) {
      setEta('まもなく完了');
    } else if (remaining < 60000) {
      setEta(`残り約 ${Math.ceil(remaining / 1000)} 秒`);
    } else {
      setEta(`残り約 ${Math.ceil(remaining / 60000)} 分`);
    }
  }, [current, total]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-72 flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-700">PDFを処理中…</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          {current} / {total} ファイル完了
        </p>
        {eta && (
          <p className="text-xs text-gray-400">{eta}</p>
        )}
      </div>
    </div>
  );
}
