import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js の Worker を CDN から読み込む（usePdfThumbnail と同じ設定）
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * PDF の全ページを DataURL 配列として返すフック。
 * ページはレンダリング完了次第インクリメンタルに追加される。
 */
export function usePdfAllPages(
  file: File | null,
  width = 700,
): { pages: string[]; loading: boolean } {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setPages([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPages([]);

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const count = pdf.numPages;
        const result: string[] = [];

        for (let i = 1; i <= count; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const scale = width / viewport.width;
          const scaled = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;

          result.push(canvas.toDataURL('image/jpeg', 0.9));
          // インクリメンタルに更新してユーザーが早く確認できるようにする
          if (!cancelled) setPages([...result]);
        }

        pdf.destroy();
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, width]);

  return { pages, loading };
}
