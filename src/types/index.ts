export type SymbolType =
  | '甲' | '乙' | '丙' | '丁' | '戊'
  | '疎甲' | '疎乙' | '弁' | '疎料' | '別紙'
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

export type StampColor = 'red' | 'blue' | 'black';

export interface FileEntry {
  id: string;
  file: File;
}

export interface FileGroup {
  id: string;
  mainFile: FileEntry;
  branchFiles: FileEntry[];
}

export interface Settings {
  symbol: SymbolType;
  customSymbol: string;
  startNumber: number;

  // PDF スタンプ設定
  stampFormat: StampFormat;
  fontSize: number;
  color: StampColor;
  marginTop: number;
  marginRight: number;
  whiteBackground: boolean;
  border: boolean;

  // ファイル名設定
  fileNameNumberFormat: FileNameNumberFormat;
  fileNameJoinFormat: FileNameJoinFormat;
  customFileNameFormat: string;

  // 処理設定
  mergeBranches: boolean;
}
