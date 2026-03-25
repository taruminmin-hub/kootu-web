import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PageData {
  pageIndex: number;
  imageBase64: string;
}

interface AnalyzeRequest {
  mode: 'split' | 'name';
  pages: PageData[];
  context?: {
    fileName?: string;
    totalPages?: number;
  };
}

const SPLIT_SYSTEM_PROMPT = `あなたは日本語の法律文書を分析する専門家です。
スキャンされた文書束やFAX受信PDF のページ画像を分析し、文書の境界を特定して、各文書に適切な日本語名を付けてください。

よくある日本語法律文書の種類:
- 契約書、覚書、合意書
- 請求書、領収書、納品書
- 陳述書、供述書
- 準備書面、答弁書、訴状
- 判決書、決定書、命令書
- 登記事項証明書、登記簿謄本
- 委任状、代理権限証明書
- 戸籍謄本、住民票
- FAX送付状、送り状
- 通知書、催告書
- 証明書、診断書
- 写真、図面、地図
- 不動産鑑定評価書
- 報告書、意見書

文書境界を判断するヒント:
- ページヘッダー/フッターの変化
- 異なる書式・レイアウトへの切り替え
- FAXヘッダー（日付・送信元情報）
- 表紙やタイトルページ
- 白紙の区切りページ
- ページ番号のリセット

以下の JSON 形式で回答してください（JSONのみ、説明不要）:
{ "segments": [{"startPage": 0, "endPage": 2, "suggestedName": "委任状", "documentType": "委任状", "confidence": 0.9}] }

ルール:
- ページ番号は0始まり
- すべてのページが必ずいずれかのセグメントに属すること
- セグメントは連続かつ重複なしであること
- suggestedName は簡潔に（2〜15文字程度）
- confidence は 0.0〜1.0（境界の確信度）`;

const NAME_SYSTEM_PROMPT = `あなたは日本語の法律文書を分析する専門家です。
PDF文書の1ページ目の画像を見て、その文書に適切な日本語名を付けてください。

以下の JSON 形式で回答してください（JSONのみ、説明不要）:
{ "suggestions": [{"pageIndex": 0, "suggestedName": "委任状", "documentType": "委任状"}] }

ルール:
- suggestedName は簡潔に（2〜15文字程度）
- 文書タイトルが見えればそれを使用
- 不明な場合は内容から推測して命名`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GEMINI_API_KEY が設定されていません' });
  }

  try {
    const body = req.body as AnalyzeRequest;

    if (!body.mode || !['split', 'name'].includes(body.mode)) {
      return res.status(400).json({ success: false, error: 'mode は "split" または "name" を指定してください' });
    }
    if (!body.pages || !Array.isArray(body.pages) || body.pages.length === 0) {
      return res.status(400).json({ success: false, error: 'pages が空です' });
    }
    if (body.pages.length > 100) {
      return res.status(400).json({ success: false, error: 'ページ数が上限(100)を超えています' });
    }

    const systemPrompt = body.mode === 'split' ? SPLIT_SYSTEM_PROMPT : NAME_SYSTEM_PROMPT;

    const userContent: Array<Record<string, unknown>> = [];

    if (body.mode === 'split') {
      userContent.push({
        text: `以下は${body.pages.length}ページの文書画像です。${
          body.context?.fileName ? `ファイル名: ${body.context.fileName}` : ''
        }\n文書の境界を特定し、各セグメントに名前を付けてください。`,
      });
    } else {
      userContent.push({
        text: `以下は${body.pages.length}個のPDFファイルの1ページ目です。それぞれに適切な名前を付けてください。`,
      });
    }

    // ページ画像を追加
    for (const page of body.pages) {
      userContent.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: page.imageBase64,
        },
      });
      userContent.push({
        text: `(ページ ${page.pageIndex + 1})`,
      });
    }

    // Gemini API 呼び出し
    const model = 'gemini-2.0-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: userContent }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return res.status(502).json({
        success: false,
        error: `Gemini API エラー (${geminiResponse.status}): ${geminiResponse.statusText}`,
      });
    }

    const geminiData = await geminiResponse.json();

    // レスポンスからテキストを抽出
    const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      return res.status(502).json({ success: false, error: 'Gemini API から有効なレスポンスを取得できませんでした' });
    }

    // JSON パース
    let result: Record<string, unknown>;
    try {
      // コードブロック内の JSON を抽出（```json ... ``` のパターン対応）
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : textContent.trim();
      result = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Gemini response:', textContent);
      return res.status(502).json({ success: false, error: 'Gemini の応答を解析できませんでした' });
    }

    // バリデーション
    if (body.mode === 'split') {
      const segments = (result as { segments?: unknown[] }).segments;
      if (!Array.isArray(segments) || segments.length === 0) {
        return res.status(502).json({ success: false, error: 'Gemini がセグメントを返しませんでした' });
      }
      // セグメントが全ページをカバーしているか簡易チェック
      const totalPages = body.pages.length;
      const lastEnd = (segments[segments.length - 1] as { endPage: number }).endPage;
      if (lastEnd !== totalPages - 1) {
        // 自動補正: 最後のセグメントの endPage を調整
        (segments[segments.length - 1] as { endPage: number }).endPage = totalPages - 1;
      }
    }

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('Analyze API error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '内部エラーが発生しました',
    });
  }
}
