import { useEffect, useState } from 'react';
import { pdfjsLib } from '../utils/pdfWorkerSetup';

/** PDF ファイルの最初のページをサムネイル DataURL として返すフック */
export function usePdfThumbnail(file: File | null, width = 120): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setDataUrl(null); return; }
    let cancelled = false;

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        if (!cancelled) setDataUrl(canvas.toDataURL('image/jpeg', 0.85));
        pdf.destroy();
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    })();

    return () => { cancelled = true; };
  }, [file, width]);

  return dataUrl;
}
