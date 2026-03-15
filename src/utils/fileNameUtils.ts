import type { FileNameJoinFormat } from '../types';

/**
 * 番号テキストと元ファイル名からリネーム後のファイル名を生成する
 */
export function buildFileName(
  numberText: string,
  originalName: string, // .pdf を含まない
  format: FileNameJoinFormat,
  customFormat: string,
): string {
  switch (format) {
    case 'space':      return `${numberText} ${originalName}.pdf`;
    case 'underscore': return `${numberText}_${originalName}.pdf`;
    case 'bracket':    return `【${numberText}】${originalName}.pdf`;
    case 'paren-full': return `（${numberText}）${originalName}.pdf`;
    case 'paren-half': return `(${numberText})${originalName}.pdf`;
    case 'custom': {
      const result = customFormat
        .replace('{stamp}', numberText)
        .replace('{name}', originalName);
      return result.toLowerCase().endsWith('.pdf') ? result : `${result}.pdf`;
    }
  }
}
