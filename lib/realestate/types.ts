export type SourceRef = { label: string; url?: string };
export type Term = {
  id: string;
  name: string;            // 正式名称
  aliases: string[];       // 一般的な呼び方・表記ゆれ
  category: "契約" | "法令" | "登記" | "税・精算" | "収益" | "賃貸" | "調査" | "物件";
  short: string;           // 初心者向けの一言
  detail: string;          // 実務向け解説
  example: string;         // 実務での使用例
  related: string[];       // 関連用語id
  cautions: string[];      // 注意点
  sources: SourceRef[];    // 参照先（原典確認用）
  /** curated=編集済み草案 / verified=公的資料で確認済み。現状はすべて curated（要・原典確認） */
  status: "curated" | "verified";
  checkedAt: string | null; // 公的資料での最終確認日 (YYYY-MM-DD)。未確認は null
};
export type Comparison = { a: string; b: string; summary: string; rows: { label: string; a: string; b: string }[]; cautions: string[] };
