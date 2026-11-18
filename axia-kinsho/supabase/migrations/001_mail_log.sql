-- 金消アプリ：メール自動更新の履歴テーブル
-- Supabase の SQL Editor にそのまま貼って Run してね（何回流しても壊れんように書いとる）。
--
-- ・メール本文は保存せん（件名・送信元・AIの要約・変更前後の値だけ）
-- ・書き込み（INSERT）は Edge Function（service role）だけ。アプリ（anon）は読む／既読・元に戻すだけ

create table if not exists public.axia_kinsho_mail_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  message_id  text not null unique,          -- Gmail のメッセージID（同じメールを二重に処理せんため）
  from_addr   text,
  subject     text,
  status      text not null default 'skipped'
              check (status in ('applied', 'review', 'unmatched', 'skipped', 'error')),
  row_id      bigint,                        -- 対象カード（axia_kinsho.id）
  summary     text,                          -- AIの判断理由など（短文）
  changes     jsonb,                         -- 反映済み：{ "fields": { key: { "before": ..., "after": ... } } }
  proposed    jsonb,                         -- 要確認：{ "fields": { key: value } }
  seen        boolean not null default false,
  undone      boolean not null default false
);

create index if not exists axia_kinsho_mail_log_created_idx
  on public.axia_kinsho_mail_log (created_at desc);

alter table public.axia_kinsho_mail_log enable row level security;

drop policy if exists "mail_log_read" on public.axia_kinsho_mail_log;
create policy "mail_log_read" on public.axia_kinsho_mail_log
  for select to anon, authenticated using (true);

drop policy if exists "mail_log_update" on public.axia_kinsho_mail_log;
create policy "mail_log_update" on public.axia_kinsho_mail_log
  for update to anon, authenticated using (true) with check (true);

-- アプリ側から書き換えてええ列は、既読・元に戻した・要確認を反映した、の分だけ
revoke insert, delete on public.axia_kinsho_mail_log from anon, authenticated;
revoke update on public.axia_kinsho_mail_log from anon, authenticated;
grant  update (seen, undone, status, changes) on public.axia_kinsho_mail_log to anon, authenticated;
grant  select on public.axia_kinsho_mail_log to anon, authenticated;

-- リアルタイム通知（メールで更新された瞬間にアプリへ知らせる）
do $$
begin
  alter publication supabase_realtime add table public.axia_kinsho_mail_log;
exception when duplicate_object then null;
end $$;
