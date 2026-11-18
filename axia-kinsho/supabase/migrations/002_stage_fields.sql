-- 進捗メール（事前承認／本承認／申込／契約／電話面談／金消／物件振替／物件確定／オープン）用の日付項目を、
-- いまの設定に「足りんものだけ」追加する。何回流しても重複せん。
--
-- ・key が同じ、または「同じ意味の項目名」が既にあれば追加せん（例：「承認日」があれば「本承認日」は足さん／「契約日」があれば足さん）
-- ・既存の項目は一切触らん
-- ※ 追加した項目は、アプリの ⚙ 設定で名前・順番・表示を自由に変えられる。

do $$
declare
  s    jsonb;
  f    jsonb;
  newf jsonb := '[
    {"key":"jizen",   "label":"事前承認日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"事前承認"},
    {"key":"honsho",  "label":"本承認日",     "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"本承認|^承認"},
    {"key":"moushi",  "label":"申込日",       "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"申込"},
    {"key":"keiyaku", "label":"契約日",       "type":"datetime", "sub":true,  "progress":true,  "print":true, "options":[], "skip":"契約"},
    {"key":"denwa",   "label":"電話面談日",   "type":"datetime", "sub":false, "progress":false, "print":true, "options":[], "skip":"面談"},
    {"key":"kinsho",  "label":"金消予定日",   "type":"datetime", "sub":true,  "progress":true,  "print":true, "options":[], "skip":"金消"},
    {"key":"furikae", "label":"物件振替日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"振替"},
    {"key":"kakutei", "label":"物件確定日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"物件確定|確定日"},
    {"key":"open",    "label":"オープン日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[], "skip":"オープン"}
  ]'::jsonb;
begin
  select settings into s from public.axia_kinsho_settings where id = 1;
  if s is null then return; end if;
  for f in select * from jsonb_array_elements(newf) loop
    if not exists (
      select 1 from jsonb_array_elements(s->'fields') e
      where e->>'key' = f->>'key' or (e->>'label') ~ (f->>'skip')
    ) then
      s := jsonb_set(s, '{fields}', (s->'fields') || jsonb_build_array(f - 'skip'));
    end if;
  end loop;
  update public.axia_kinsho_settings set settings = s, updated_at = now() where id = 1;
end $$;
