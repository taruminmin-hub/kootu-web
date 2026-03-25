import type { AiSplitSegment, AiNameSuggestion } from '../types';
import { renderPagesToBase64, renderFirstPageToBase64 } from './pdfRenderer';

interface AnalyzeResponse {
  success: boolean;
  result?: {
    segments?: AiSplitSegment[];
    suggestions?: AiNameSuggestion[];
  };
  error?: string;
}

const MAX_PAGES = 100;

/**
 * PDF を Gemini API で分析し、文書の分割点と推奨名を返す。
 */
export async function analyzePdfForSplit(
  file: File,
  onProgress?: (stage: 'rendering' | 'analyzing', current: number, total: number) => void,
): Promise<AiSplitSegment[]> {
  // ページ画像をレンダリング
  const pages = await renderPagesToBase64(
    file,
    { maxWidth: 800, quality: 0.7 },
    (cur, tot) => onProgress?.('rendering', cur, tot),
  );

  if (pages.length > MAX_PAGES) {
    throw new Error(`ページ数が上限 (${MAX_PAGES}ページ) を超えています。${pages.length}ページのPDFは分割できません。`);
  }

  onProgress?.('analyzing', 0, 1);

  const response = await callAnalyzeApi({
    mode: 'split',
    pages: pages.map((base64, i) => ({ pageIndex: i, imageBase64: base64 })),
    context: { fileName: file.name, totalPages: pages.length },
  });

  if (!response.success || !response.result?.segments) {
    throw new Error(response.error ?? 'AI分析に失敗しました');
  }

  onProgress?.('analyzing', 1, 1);

  return validateSplitSegments(response.result.segments, pages.length);
}

/**
 * 複数ファイルの1ページ目を Gemini API で分析し、推奨名を返す。
 */
export async function analyzeFilesForNaming(
  files: File[],
  onProgress?: (stage: 'rendering' | 'analyzing', current: number, total: number) => void,
): Promise<AiNameSuggestion[]> {
  // 各ファイルの1ページ目をレンダリング
  const pageImages: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const base64 = await renderFirstPageToBase64(files[i], { maxWidth: 800, quality: 0.7 });
    pageImages.push(base64);
    onProgress?.('rendering', i + 1, files.length);
  }

  onProgress?.('analyzing', 0, 1);

  const response = await callAnalyzeApi({
    mode: 'name',
    pages: pageImages.map((base64, i) => ({ pageIndex: i, imageBase64: base64 })),
  });

  if (!response.success || !response.result?.suggestions) {
    throw new Error(response.error ?? 'AI分析に失敗しました');
  }

  onProgress?.('analyzing', 1, 1);

  return response.result.suggestions;
}

async function callAnalyzeApi(body: {
  mode: 'split' | 'name';
  pages: Array<{ pageIndex: number; imageBase64: string }>;
  context?: { fileName?: string; totalPages?: number };
}): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `API エラー (${res.status})`);
  }

  return res.json();
}

/**
 * セグメントのバリデーション: 全ページをカバーし、連続かつ重複なしであることを確認
 */
function validateSplitSegments(segments: AiSplitSegment[], totalPages: number): AiSplitSegment[] {
  if (segments.length === 0) {
    return [{ startPage: 0, endPage: totalPages - 1, suggestedName: '文書', documentType: '不明', confidence: 0 }];
  }

  // startPage 順にソート
  const sorted = [...segments].sort((a, b) => a.startPage - b.startPage);

  // 先頭補正
  if (sorted[0].startPage !== 0) {
    sorted[0].startPage = 0;
  }

  // 末尾補正
  if (sorted[sorted.length - 1].endPage !== totalPages - 1) {
    sorted[sorted.length - 1].endPage = totalPages - 1;
  }

  // ギャップ・重複の補正
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startPage !== sorted[i - 1].endPage + 1) {
      sorted[i].startPage = sorted[i - 1].endPage + 1;
    }
    if (sorted[i].startPage > sorted[i].endPage) {
      // 無効なセグメントを削除
      sorted.splice(i, 1);
      i--;
    }
  }

  return sorted;
}
