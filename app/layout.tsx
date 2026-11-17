import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s | ${APP_NAME}` },
  description: "漢字検索・不動産用語辞典・韓国語翻訳学習をひとつに統合したパーソナル辞書アプリ。",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#08080d", width: "device-width", initialScale: 1, viewportFit: "cover" };

// 初回描画前にテーマを適用（ちらつき防止）
const themeScript = `try{var t=localStorage.getItem('lexa:theme')||'dark';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><Providers><AppShell>{children}</AppShell></Providers></body>
    </html>
  );
}
