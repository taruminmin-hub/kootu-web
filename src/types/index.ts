export type SymbolType =
  | '甲' | '乙' | '丙' | '丁' | '戊'
  | '疎甲' | '疎乙' | '弁' | '資料' | '別紙'
  | 'custom';

/** PDF スタンプに印字する番号形式（3種） */
export type StampFormat = 'full-cert' | 'cert' | 'simple';
// full-cert : 甲第1号証 / 甲第1号証の2
// cert      : 甲1号証   / 甲1号証の2
// simple    : 甲1       / 甲1の2

/** 出力ファイル名の番号部分の形式（5種） */
export type FileNameNumberFormat =
  | 'zero-padded'   // 甲001 / 甲001-1
  | 'simple-no'     // 甲1   / 甲1の2
  | 'simple-dash'   // 甲1   / 甲1-2
  | 'full-cert'     // 甲第1号証 / 甲第1号証の2
  | 'cert';         // 甲1号証   / 甲1号証の2

/** ファイル名の組み立て形式（6種） */
export type FileNameJoinFormat =
  | 'space'        // 甲001 書類名.pdf
  | 'underscore'   // 甲001_書類名.pdf
  | 'bracket'      // 【甲001】書類名.pdf
  | 'paren-full'   // （甲001）書類名.pdf
  | 'paren-half'   // (甲001)書類名.pdf
  | 'custom';

export type StampColor = 'red' | 'blue' | 'green' | 'black';

export interface StampPosition {
  /** PDF 右端からの距離 (pt) */
  marginRight: number;
  /** PDF 上端からの距離 (pt) */
  marginTop: number;
}

export interface FileEntry {
  id: string;
  file: File;
  /** ユーザーが設定したカスタム出力ファイル名（拡張子なし）。未設定は undefined */
  customOutputName?: string;
  /** ファイルごとのスタンプ位置上書き。未設定はグローバル設定を使用 */
  customStampPosition?: StampPosition;
  /** 出力時の回転角度 (度、時計回り)。0=無回転、90=CW90°、180=180°、270=CCW90° */
  rotation: 0 | 90 | 180 | 270;
}

export interface FileGroup {
  id: string;
  mainFile: FileEntry;
  branchFiles: FileEntry[];
  /** グループ単位の枝番結合設定。未設定はグローバル設定を使用 */
  mergeBranches?: boolean;
}

export type PageNumberFormat = 'n' | 'n/total' | 'dash-n-dash';
// n         : 1, 2, 3
// n/total   : 1/3, 2/3
// dash-n-dash : - 1 -, - 2 -

export type PageNumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left';

export interface Settings {
  symbol: SymbolType;
  customSymbol: string;
  startNumber: number;
  /** true のとき番号を付けず符号のみをスタンプする */
  numberless: boolean;

  // PDF スタンプ設定
  stampFormat: StampFormat;
  fontSize: number;
  color: StampColor;
  marginTop: number;
  marginRight: number;
  whiteBackground: boolean;
  border: boolean;

  // ページ番号設定
  pageNumberEnabled: boolean;
  pageNumberFormat: PageNumberFormat;
  pageNumberPosition: PageNumberPosition;
  pageNumberFontSize: number;
  pageNumberColor: StampColor;

  // ファイル名設定
  fileNameNumberFormat: FileNameNumberFormat;
  fileNameJoinFormat: FileNameJoinFormat;
  customFileNameFormat: string;

  // 処理設定
  mergeBranches: boolean;
}

// ── AI 分析関連 ──

export interface AiSplitSegment {
  startPage: number;
  endPage: number;
  suggestedName: string;
  documentType: string;
  confidence: number;
}

export interface AiNameSuggestion {
  pageIndex: number;
  suggestedName: string;
  documentType: string;
}
