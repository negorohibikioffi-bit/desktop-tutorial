-- ログインした人だけがデータを読み書きできるようにする（手順1の最後に1回流す。再実行OK）
--
-- 000/001 では「キーを知っとる人は誰でも」読み書きできる設定やった。
-- ここで anon（ログインしとらん人）の権限を全部外して、authenticated（ログイン済み）だけに絞る。
-- ※ 実行する前に、Authentication → Users でログイン用のユーザーを作っとくこと（README 手順1.5）。
--   作らんまま流すと、アプリに誰も入れんくなる。
-- ※ メールを取り込む関数（Edge Function）は service role で動くので、これの影響は受けん。

-- 案件
drop policy if exists "kinsho_all" on public.axia_kinsho;
create policy "kinsho_all" on public.axia_kinsho
  for all to authenticated using (true) with check (true);

-- 項目設定
drop policy if exists "kinsho_settings_all" on public.axia_kinsho_settings;
create policy "kinsho_settings_all" on public.axia_kinsho_settings
  for all to authenticated using (true) with check (true);

-- メール履歴（読む・既読にする・元に戻す のみ）
drop policy if exists "mail_log_read" on public.axia_kinsho_mail_log;
create policy "mail_log_read" on public.axia_kinsho_mail_log
  for select to authenticated using (true);
drop policy if exists "mail_log_update" on public.axia_kinsho_mail_log;
create policy "mail_log_update" on public.axia_kinsho_mail_log
  for update to authenticated using (true) with check (true);

-- ログインしとらん人（anon）の権限を全部外す
revoke all on public.axia_kinsho          from anon;
revoke all on public.axia_kinsho_settings from anon;
revoke all on public.axia_kinsho_mail_log from anon;
revoke all on sequence public.axia_kinsho_id_seq from anon;

-- ログイン済みの人の権限（念のため明示）
grant select, insert, update, delete on public.axia_kinsho          to authenticated;
grant select, insert, update, delete on public.axia_kinsho_settings to authenticated;
grant usage, select on sequence public.axia_kinsho_id_seq to authenticated;
grant select on public.axia_kinsho_mail_log to authenticated;
revoke update on public.axia_kinsho_mail_log from authenticated;
grant  update (seen, undone, status, changes) on public.axia_kinsho_mail_log to authenticated;
-- メール履歴は、アプリから追加・削除はさせん
revoke insert, delete on public.axia_kinsho_mail_log from authenticated;
