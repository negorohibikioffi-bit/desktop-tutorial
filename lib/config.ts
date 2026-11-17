// アプリ名は環境変数 NEXT_PUBLIC_APP_NAME で後から変更できる（仮称）。
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Lexa";
export const APP_TAGLINE = "漢字・不動産・韓国語を、ひとつに。";

export type Kind = "kanji" | "term" | "korean";
export const KINDS: { id: Kind; path: string; label: string; short: string; hint: string }[] = [
  { id: "kanji", path: "/kanji", label: "漢字", short: "漢字", hint: "さんずいに青" },
  { id: "term", path: "/realestate", label: "不動産用語", short: "不動産", hint: "サブリース" },
  { id: "korean", path: "/korean", label: "韓国語", short: "韓国語", hint: "今何してる？" },
];
export const kindMeta = (k: Kind) => KINDS.find((x) => x.id === k)!;
