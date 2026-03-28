/** PDF注釈ツールの種類 */
export type AnnotationTool =
  | 'select'     // 選択（デフォルト）
  | 'rect'       // 矩形（枠線）
  | 'ellipse'    // 楕円
  | 'arrow'      // 矢印
  | 'line'       // 直線
  | 'freehand'   // フリーハンド
  | 'highlight'  // ハイライト（半透明矩形）
  | 'text'       // テキスト注釈
  | 'redaction'; // 墨消し（黒塗り）

/** 注釈データ（CSS pixel 座標系、表示上の位置） */
export interface Annotation {
  id: string;
  type: AnnotationTool;
  /** 左上X (px) */
  x: number;
  /** 左上Y (px) */
  y: number;
  /** 幅 (px) - rect, ellipse, highlight, redaction */
  width: number;
  /** 高さ (px) */
  height: number;
  /** 終点X (px) - line, arrow */
  x2?: number;
  /** 終点Y (px) - line, arrow */
  y2?: number;
  /** フリーハンドの点列 (px) */
  points?: { x: number; y: number }[];
  /** テキスト内容 */
  text?: string;
  /** 線の色 (hex) */
  strokeColor: string;
  /** 塗り色 (hex) */
  fillColor: string;
  /** 線の太さ (px表示上) */
  lineWidth: number;
  /** 不透明度 (0-1) */
  opacity: number;
}

/** ツールのデフォルトスタイル設定 */
export interface AnnotationStyle {
  strokeEnabled: boolean;
  strokeColor: string;
  fillEnabled: boolean;
  fillColor: string;
  lineWidth: number;
  opacity: number;
}
