import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { generateStampText, getSymbolText, createStampImage } from '../utils/stampUtils';
import type { StampFormat, FileNameNumberFormat, FileNameJoinFormat, StampColor, PageNumberFormat, PageNumberPosition } from '../types';

interface Props {
  onClose: () => void;
}

const STAMP_FORMATS: { value: StampFormat; label: string }[] = [
  { value: 'full-cert', label: '甲第1号証 / 甲第1号証の2' },
  { value: 'cert',      label: '甲1号証   / 甲1号証の2' },
  { value: 'simple',    label: '甲1       / 甲1の2' },
];

const FILENAME_NUMBER_FORMATS: { value: FileNameNumberFormat; label: string }[] = [
  { value: 'zero-padded', label: '甲001 / 甲001-1' },
  { value: 'simple-no',   label: '甲1 / 甲1の2' },
  { value: 'simple-dash', label: '甲1 / 甲1-2' },
  { value: 'full-cert',   label: '甲第1号証 / 甲第1号証の2' },
  { value: 'cert',        label: '甲1号証 / 甲1号証の2' },
];

const FILENAME_JOIN_FORMATS: { value: FileNameJoinFormat; label: string }[] = [
  { value: 'space',      label: '甲001 書類名.pdf' },
  { value: 'underscore', label: '甲001_書類名.pdf' },
  { value: 'bracket',    label: '【甲001】書類名.pdf' },
  { value: 'paren-full', label: '（甲001）書類名.pdf' },
  { value: 'paren-half', label: '(甲001)書類名.pdf' },
  { value: 'custom',     label: 'カスタム' },
];

export default function SettingsModal({ onClose }: Props) {
  const { settings, updateSettings } = useStore();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const pageNumPreviewRef = useRef<HTMLCanvasElement>(null);

  // スタンププレビューを更新
  useEffect(() => {
    let cancelled = false;
    const sym = getSymbolText(settings.symbol, settings.customSymbol);
    const text = generateStampText(sym, 1, null, settings.stampFormat);
    createStampImage(text, settings.fontSize, settings.color, settings.whiteBackground, settings.border)
      .then((bytes) => {
        if (cancelled || !previewRef.current) return;
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled || !previewRef.current) { URL.revokeObjectURL(url); return; }
          const ctx = previewRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
          ctx.drawImage(img, 0, 0, img.width / 3, img.height / 3);
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => {/* ignore */});
    return () => { cancelled = true; };
  }, [settings.stampFormat, settings.fontSize, settings.color,
      settings.whiteBackground, settings.border, settings.symbol, settings.customSymbol]);

  useEffect(() => {
    if (!settings.pageNumberEnabled) {
      if (pageNumPreviewRef.current) {
        const ctx = pageNumPreviewRef.current.getContext('2d');
        ctx?.clearRect(0, 0, pageNumPreviewRef.current.width, pageNumPreviewRef.current.height);
      }
      return;
    }
    let cancelled = false;
    const text = settings.pageNumberFormat === 'n/total' ? '1/3'
      : settings.pageNumberFormat === 'dash-n-dash' ? '- 1 -' : '1';
    createStampImage(text, settings.pageNumberFontSize, settings.pageNumberColor, false, false)
      .then((bytes) => {
        if (cancelled || !pageNumPreviewRef.current) return;
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled || !pageNumPreviewRef.current) { URL.revokeObjectURL(url); return; }
          const ctx = pageNumPreviewRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, pageNumPreviewRef.current.width, pageNumPreviewRef.current.height);
          ctx.drawImage(img, 0, 0, img.width / 3, img.height / 3);
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [settings.pageNumberEnabled, settings.pageNumberFormat, settings.pageNumberFontSize, settings.pageNumberColor]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-bold text-gray-800">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="px-6 py-4 space-y-6">

          {/* ── PDF スタンプ ── */}
          <section>
            <h3 className="text-sm font-bold text-gray-700 mb-3">PDF スタンプ</h3>

            {/* 番号形式 */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">番号形式</p>
              {STAMP_FORMATS.map((f) => (
                <label key={f.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 ${settings.stampFormat === f.value ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'}`}>
                  <input type="radio" name="stampFormat" value={f.value}
                    checked={settings.stampFormat === f.value}
                    onChange={() => updateSettings({ stampFormat: f.value as StampFormat })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>

            {/* フォントサイズ */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">フォントサイズ: <strong>{settings.fontSize}pt</strong></p>
              <input type="range" min={8} max={24} value={settings.fontSize}
                onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>8</span><span>16</span><span>24</span>
              </div>
            </div>

            {/* 色 */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">色</p>
              <div className="flex gap-2">
                {(['red', 'blue', 'black'] as StampColor[]).map((c) => {
                  const label = c === 'red' ? '赤' : c === 'blue' ? '青' : '黒';
                  const active = settings.color === c;
                  const cls = c === 'red' ? 'bg-red-100 border-red-500 text-red-700'
                    : c === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                    : 'bg-gray-100 border-gray-600 text-gray-700';
                  return (
                    <button key={c}
                      onClick={() => updateSettings({ color: c })}
                      className={`px-4 py-1.5 rounded-full border-2 text-sm font-medium transition-all ${active ? cls : 'bg-white border-gray-300 text-gray-500'}`}
                    >{label}</button>
                  );
                })}
              </div>
            </div>

            {/* 位置 */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">位置（右上からの余白 pt）</p>
              <div className="flex gap-4">
                <div>
                  <label className="text-xs text-gray-500">上からの距離</label>
                  <input type="number" min={0} max={200} value={settings.marginTop}
                    onChange={(e) => updateSettings({ marginTop: Number(e.target.value) })}
                    className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">右からの距離</label>
                  <input type="number" min={0} max={200} value={settings.marginRight}
                    onChange={(e) => updateSettings({ marginRight: Number(e.target.value) })}
                    className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                  />
                </div>
              </div>
            </div>

            {/* オプション */}
            <div className="mb-4 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.whiteBackground}
                  onChange={(e) => updateSettings({ whiteBackground: e.target.checked })}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">スタンプ背景を白にする（文字被り防止）</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.border}
                  onChange={(e) => updateSettings({ border: e.target.checked })}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-sm text-gray-700">枠線を付ける</span>
              </label>
            </div>

            {/* スタンププレビュー */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">スタンプ プレビュー</p>
              <div className="bg-white border border-gray-200 rounded h-20 flex items-start justify-end p-2 relative overflow-hidden">
                <span className="text-xs text-gray-300 absolute inset-0 flex items-center justify-center">PDF</span>
                <canvas ref={previewRef} className="relative z-10" />
              </div>
            </div>
          </section>

          <hr />

          {/* ── 出力ファイル名 ── */}
          <section>
            <h3 className="text-sm font-bold text-gray-700 mb-3">出力ファイル名</h3>

            {/* 番号形式 */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">番号形式</p>
              {FILENAME_NUMBER_FORMATS.map((f) => (
                <label key={f.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 ${settings.fileNameNumberFormat === f.value ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'}`}>
                  <input type="radio" name="fnNumberFormat" value={f.value}
                    checked={settings.fileNameNumberFormat === f.value}
                    onChange={() => updateSettings({ fileNameNumberFormat: f.value as FileNameNumberFormat })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>

            {/* ファイル名の形式 */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">ファイル名の形式</p>
              {FILENAME_JOIN_FORMATS.map((f) => (
                <label key={f.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 ${settings.fileNameJoinFormat === f.value ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'}`}>
                  <input type="radio" name="fnJoinFormat" value={f.value}
                    checked={settings.fileNameJoinFormat === f.value}
                    onChange={() => updateSettings({ fileNameJoinFormat: f.value as FileNameJoinFormat })}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
              {settings.fileNameJoinFormat === 'custom' && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 mb-1">
                    &#123;stamp&#125; = 番号、&#123;name&#125; = ファイル名
                  </p>
                  <input type="text"
                    value={settings.customFileNameFormat}
                    onChange={(e) => updateSettings({ customFileNameFormat: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full"
                    placeholder="{stamp} {name}.pdf"
                  />
                </div>
              )}
            </div>
          </section>

          <hr />

          {/* ── ページ番号 ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">ページ番号</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.pageNumberEnabled}
                  onChange={(e) => updateSettings({ pageNumberEnabled: e.target.checked })}
                  className="accent-blue-600 w-4 h-4"
                />
                <span className="text-sm text-gray-600">有効にする</span>
              </label>
            </div>

            <div className={`space-y-4 transition-opacity ${settings.pageNumberEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
              {/* 番号形式 */}
              <div>
                <p className="text-xs text-gray-500 mb-2">番号形式</p>
                {([
                  { value: 'n', label: '1, 2, 3 …' },
                  { value: 'n/total', label: '1/3, 2/3, 3/3 …' },
                  { value: 'dash-n-dash', label: '- 1 -, - 2 -, - 3 - …' },
                ] as { value: PageNumberFormat; label: string }[]).map((f) => (
                  <label key={f.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 ${settings.pageNumberFormat === f.value ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'}`}>
                    <input type="radio" name="pageNumFormat" value={f.value}
                      checked={settings.pageNumberFormat === f.value}
                      onChange={() => updateSettings({ pageNumberFormat: f.value })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>

              {/* 位置 */}
              <div>
                <p className="text-xs text-gray-500 mb-2">位置</p>
                {([
                  { value: 'bottom-center', label: '下中央' },
                  { value: 'bottom-right',  label: '下右' },
                  { value: 'bottom-left',   label: '下左' },
                ] as { value: PageNumberPosition; label: string }[]).map((p) => (
                  <label key={p.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 ${settings.pageNumberPosition === p.value ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'}`}>
                    <input type="radio" name="pageNumPos" value={p.value}
                      checked={settings.pageNumberPosition === p.value}
                      onChange={() => updateSettings({ pageNumberPosition: p.value })}
                      className="accent-blue-600"
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>

              {/* フォントサイズ */}
              <div>
                <p className="text-xs text-gray-500 mb-1">フォントサイズ: <strong>{settings.pageNumberFontSize}pt</strong></p>
                <input type="range" min={8} max={16} value={settings.pageNumberFontSize}
                  onChange={(e) => updateSettings({ pageNumberFontSize: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>

              {/* 色 */}
              <div>
                <p className="text-xs text-gray-500 mb-2">色</p>
                <div className="flex gap-2">
                  {(['red', 'blue', 'black'] as StampColor[]).map((c) => {
                    const label = c === 'red' ? '赤' : c === 'blue' ? '青' : '黒';
                    const active = settings.pageNumberColor === c;
                    const cls = c === 'red' ? 'bg-red-100 border-red-500 text-red-700'
                      : c === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                      : 'bg-gray-100 border-gray-600 text-gray-700';
                    return (
                      <button key={c}
                        onClick={() => updateSettings({ pageNumberColor: c })}
                        className={`px-4 py-1.5 rounded-full border-2 text-sm font-medium transition-all ${active ? cls : 'bg-white border-gray-300 text-gray-500'}`}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>

              {/* ページ番号プレビュー */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">ページ番号 プレビュー</p>
                <div className={`bg-white border border-gray-200 rounded h-20 relative overflow-hidden flex items-end ${
                  settings.pageNumberPosition === 'bottom-right' ? 'justify-end' :
                  settings.pageNumberPosition === 'bottom-left' ? 'justify-start' : 'justify-center'
                } p-2`}>
                  <span className="text-xs text-gray-300 absolute inset-0 flex items-center justify-center">PDF</span>
                  <canvas ref={pageNumPreviewRef} className="relative z-10" />
                </div>
              </div>
            </div>
          </section>

          <hr />

          {/* ── 処理設定 ── */}
          <section>
            <h3 className="text-sm font-bold text-gray-700 mb-3">処理設定</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.mergeBranches}
                onChange={(e) => updateSettings({ mergeBranches: e.target.checked })}
                className="accent-blue-600 w-4 h-4"
              />
              <span className="text-sm text-gray-700">枝番ファイルを結合して1ファイルにする</span>
            </label>
          </section>
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
