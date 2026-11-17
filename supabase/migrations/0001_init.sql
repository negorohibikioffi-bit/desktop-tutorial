-- Lexa: クラウド同期用スキーマ。Supabase の SQL Editor で実行、または `supabase db push`。
-- すべてのテーブルで Row Level Security を有効化し、本人の行のみ読み書き可能にする。

create table if not exists public.saved_items (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,                       -- 例: kanji:清 / term:sublease / korean:doing-now
  kind       text not null check (kind in ('kanji','term','korean')),
  ref        text not null,
  title      text not null,
  subtitle   text not null default '',
  payload    jsonb,                               -- AI生成結果などのスナップショット
  favorite   boolean not null default false,
  folder     text,
  deleted    boolean not null default false,      -- 論理削除（端末間で削除を伝播させる）
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.search_history (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id       text not null,
  kind     text not null check (kind in ('kanji','term','korean')),
  query    text not null,
  label    text,
  at       timestamptz not null default now(),
  deleted  boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists saved_items_user_updated on public.saved_items (user_id, updated_at desc);
create index if not exists history_user_at on public.search_history (user_id, at desc);

alter table public.saved_items    enable row level security;
alter table public.search_history enable row level security;
alter table public.user_settings  enable row level security;

-- 各テーブル: 認証済みユーザーが自分の行だけ select / insert / update / delete できる
do $$
declare t text;
begin
  foreach t in array array['saved_items','search_history','user_settings'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy "own_insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy "own_update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own_delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- anon ロール(未ログイン)には一切権限を与えない
revoke all on public.saved_items, public.search_history, public.user_settings from anon;
