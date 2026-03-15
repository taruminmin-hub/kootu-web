import { useCallback, useState } from 'react';
import { isPdfFile, isImageFile } from '../utils/imageConverter';

interface Props {
  onDrop: (files: File[]) => void;
  compact?: boolean;
}

export default function DropZone({ onDrop, compact }: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => isPdfFile(f) || isImageFile(f),
      );
      if (files.length > 0) onDrop(files);
    },
    [onDrop],
  );

  if (compact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-3 text-center text-sm text-gray-400 transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50 text-blue-500' : 'border-gray-300'
        }`}
      >
        PDF・画像（JPEG/PNG/HEIC）をドラッグ＆ドロップして追加
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center h-full min-h-64 border-2 border-dashed rounded-xl transition-colors ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white'
      }`}
    >
      <div className="text-5xl mb-3 text-gray-300">⬆</div>
      <p className="text-gray-500 font-medium">ファイルをここにドラッグ＆ドロップ</p>
      <p className="text-gray-400 text-sm mt-1">PDF / JPEG / PNG / HEIC に対応</p>
      <p className="text-gray-400 text-sm">または左側の「ファイル追加」ボタンから選択</p>
    </div>
  );
}
