import * as pdfjsLib from 'pdfjs-dist';

// PDF.js の Worker を CDN から読み込む（一元設定）
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export { pdfjsLib };
