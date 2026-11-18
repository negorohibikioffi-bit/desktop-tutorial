// ★ここを自分の Supabase プロジェクトの値に書き換える（README「手順0」）
//   Supabase → Project Settings → API の「Project URL」と「anon public」キー。
//   ※ publishable（旧anon）キーは公開前提のキー（画面のJSに入る）。secret / service_role キーは絶対にここへ書かんこと。
window.KINSHO_CONFIG = {
  supabaseUrl: 'https://kufcrnopolzebfogdugq.supabase.co',
  supabaseAnonKey: 'sb_publishable_7gjW5XkX-HQNgS95vJuMSA_Rk2zdCLD',
  // ログイン画面を使うか（true にすると、メール＋パスワードでログインした人だけが使える。README 手順1.5・003_auth.sql が必要）
  requireLogin: false,
};
