import { useState, useEffect, useRef } from 'react';
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

const COLOR_OPTIONS: { value: StampColor; label: string; activeCls: string }[] = [
  { value: 'red',   label: '赤', activeCls: 'bg-red-100 border-red-500 text-red-700' },
  { value: 'blue',  label: '青', activeCls: 'bg-blue-100 border-blue-500 text-blue-700' },
  { value: 'green', label: '緑', activeCls: 'bg-green-100 border-green-600 text-green-700' },
  { value: 'black', label: '黒', activeCls: 'bg-gray-100 border-gray-600 text-gray-700' },
];

type Tab = 'stamp' | 'filename' | 'pagenum' | 'other';

const TABS: { key: Tab; label: string }[] = [
  { key: 'stamp',    label: 'スタンプ' },
  { key: 'filename', label: 'ファイル名' },
  { key: 'pagenum',  label: 'ページ番号' },
  { key: 'other',    label: 'その他' },
];

function ColorPicker({ value, onChange }: { value: StampColor; onChange: (c: StampColor) => void }) {
  return (
    <div className="flex gap-2">
      {COLOR_OPTIONS.map((c) => (
        <button key={c.value}
          onClick={() => onChange(c.value)}
          className={`px-3 py-1.5 rounded-full border-2 text-sm font-medium transition-all ${value === c.value ? c.activeCls : 'bg-white border-gray-300 text-gray-500'}`}
        >{c.label}</button>
      ))}
    </div>
  );
}

export default function SettingsModal({ onClose }: Props) {
  const { settings, updateSettings } = useStore();
  const [tab, setTab] = useState<Tab>('stamp');
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
          const dw = Math.ceil(img.width / 3);
          const dh = Math.ceil(img.height / 3);
          previewRef.current.width = dw;
          previewRef.current.height = dh;
          const ctx = previewRef.current.getContext('2d')!;
          ctx.drawImage(img, 0, 0, dw, dh);
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
          const dw = Math.ceil(img.width / 3);
          const dh = Math.ceil(img.height / 3);
          pageNumPreviewRef.current.width = dw;
          pageNumPreviewRef.current.height = dh;
          const ctx = pageNumPreviewRef.current.getContext('2d')!;
          ctx.drawImage(img, 0, 0, dw, dh);
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [settings.pageNumberEnabled, settings.pageNumberFormat, settings.pageNumberFontSize, settings.pageNumberColor]);

  /** pt → mm 変換（表示用） */
  const ptToMm = (pt: number) => (pt * 0.3528).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true" aria-label="設定">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-bold text-gray-800">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* タブナビゲーション */}
        <div className="flex border-b shrink-0 px-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                tab === t.key
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── スタンプ タブ ── */}
          {tab === 'stamp' && (
            <>
              {/* 番号形式 */}
              <div>
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
              <div>
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
              <div>
                <p className="text-xs text-gray-500 mb-2">色</p>
                <ColorPicker value={settings.color} onChange={(c) => updateSettings({ color: c })} />
              </div>

              {/* 位置 */}
              <div>
                <p className="text-xs text-gray-500 mb-2">位置（右上からの余白）</p>
                <div className="flex gap-4">
                  <div>
                    <label className="text-xs text-gray-500">上からの距離</label>
                    <input type="number" min={0} max={200} value={settings.marginTop}
                      onChange={(e) => updateSettings({ marginTop: Number(e.target.value) })}
                      className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                    />
                    <span className="text-[10px] text-gray-400">{ptToMm(settings.marginTop)} mm</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">右からの距離</label>
                    <input type="number" min={0} max={200} value={settings.marginRight}
                      onChange={(e) => updateSettings({ marginRight: Number(e.target.value) })}
                      className="block mt-1 border border-gray-300 rounded px-2 py-1 text-sm w-24 text-center"
                    />
                    <span className="text-[10px] text-gray-400">{ptToMm(settings.marginRight)} mm</span>
                  </div>
                </div>
              </div>

              {/* オプション */}
              <div className="space-y-2">
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
            </>
          )}

          {/* ── ファイル名 タブ ── */}
          {tab === 'filename' && (
            <>
              {/* 番号形式 */}
              <div>
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
              <div>
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
            </>
          )}

          {/* ── ページ番号 タブ ── */}
          {tab === 'pagenum' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">ページ番号を有効にする</p>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.pageNumberEnabled}
                    onChange={(e) => updateSettings({ pageNumberEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
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
                  <ColorPicker value={settings.pageNumberColor} onChange={(c) => updateSettings({ pageNumberColor: c })} />
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
            </>
          )}

          {/* ── その他 タブ ── */}
          {tab === 'other' && (
            <>
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">処理設定</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.mergeBranches}
                    onChange={(e) => updateSettings({ mergeBranches: e.target.checked })}
                    className="accent-blue-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">枝番ファイルを結合して1ファイルにする</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t shrink-0">
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
