-- 金消アプリ：基本テーブル（新しい Supabase プロジェクトで最初に1回だけ流す）
-- Supabase の SQL Editor に貼って Run。何回流しても壊れん（再実行OK）。
--
-- ※ このアプリはログイン無しのチーム共用なので、「プロジェクトURL＋anonキーを知っとる人」は読み書きできる。
--    URL・キーはチーム外に出さんこと（元のアプリと同じ守り方）。

create table if not exists public.axia_kinsho (
  id          bigserial primary key,
  month       text   not null,                    -- 'YYYY-MM'
  name        text   not null default '',
  fields      jsonb  not null default '{}'::jsonb, -- 設定の項目 key → 値
  sort_order  bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists axia_kinsho_month_idx on public.axia_kinsho (month);

create table if not exists public.axia_kinsho_settings (
  id          int primary key,                    -- いつも 1
  settings    jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.axia_kinsho          enable row level security;
alter table public.axia_kinsho_settings enable row level security;

drop policy if exists "kinsho_all" on public.axia_kinsho;
create policy "kinsho_all" on public.axia_kinsho
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "kinsho_settings_all" on public.axia_kinsho_settings;
create policy "kinsho_settings_all" on public.axia_kinsho_settings
  for all to anon, authenticated using (true) with check (true);

-- Data API の権限（プロジェクト作成時に「自動で付与」を切っとっても動くよう、明示しとく）
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.axia_kinsho          to anon, authenticated;
grant select, insert, update, delete on public.axia_kinsho_settings to anon, authenticated;
grant usage, select on sequence public.axia_kinsho_id_seq to anon, authenticated;

-- 最初の項目設定（アプリの ⚙ 設定画面でいつでも変えられる）
insert into public.axia_kinsho_settings (id, settings) values (1, '{
  "appTitle": "金消予定日 一覧",
  "subTitle": "AXIA JAPAN ／ 仕入れ事業部",
  "nameLabel": "名前",
  "mainKey": "kinsho",
  "fields": [
    {"key":"bukken",  "label":"物件名",     "type":"text",     "sub":true,  "progress":false, "print":true,  "options":[]},
    {"key":"room",    "label":"号室",       "type":"text",     "sub":true,  "progress":false, "print":true,  "options":[]},
    {"key":"jizen",   "label":"事前承認日",   "type":"date",     "sub":true,  "progress":true,  "print":true,  "options":[]},
    {"key":"honsho",  "label":"本承認日",     "type":"date",     "sub":true,  "progress":true,  "print":true,  "options":[]},
    {"key":"moushi",  "label":"申込日",       "type":"date",     "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"keiyaku", "label":"契約日",       "type":"datetime", "sub":true,  "progress":true,  "print":true,  "options":[]},
    {"key":"denwa",   "label":"電話面談日",   "type":"datetime", "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"kinsho",  "label":"金消予定日",   "type":"datetime", "sub":true,  "progress":true,  "print":true,  "options":[]},
    {"key":"furikae", "label":"物件振替日",   "type":"date",     "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"kakutei", "label":"物件確定日",   "type":"date",     "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"open",    "label":"オープン日",   "type":"date",     "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"kessai",  "label":"決済日",       "type":"date",     "sub":false, "progress":false, "print":true,  "options":[]},
    {"key":"bank",    "label":"銀行",       "type":"select",   "sub":true,  "progress":false, "print":true,  "options":["SBI","楽天","三井住友","りそな"]},
    {"key":"kanri",   "label":"賃貸管理",   "type":"select",   "sub":false, "progress":false, "print":false, "options":["あり","なし"]},
    {"key":"tateman", "label":"建物管理",   "type":"select",   "sub":false, "progress":false, "print":false, "options":["あり","なし"]}
  ]
}'::jsonb)
on conflict (id) do nothing;

-- リアルタイム同期（チーム全員の画面に即反映）
do $$ begin alter publication supabase_realtime add table public.axia_kinsho;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.axia_kinsho_settings; exception when duplicate_object then null; end $$;
