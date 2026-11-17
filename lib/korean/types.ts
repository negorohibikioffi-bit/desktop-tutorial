export type Form = { ko: string; kana: string; rom: string };
export type Slang = {
  ko: string; kana: string; rom: string;
  meaning: string; scene: string; risk: "なし" | "やや注意" | "要注意（粗い表現）"; risk_note?: string;
};
export type Phrase = {
  id: string;
  ja: string[];              // 想定される日本語入力（先頭が代表）
  formal?: Form;             // 합쇼체（フォーマル）
  polite: Form;              // 해요체（丁寧）
  casual: Form;              // 반말（タメ口）
  slang?: Slang[];
  tips: string[];            // 発音のポイント
  nuance: string;
  /** 'curated' = 編集済み辞書 / 'ai' = AI生成（実使用未確認） */
  origin: "curated" | "ai";
  checkedAt: string | null;  // 実使用の確認日。未確認は null
};
