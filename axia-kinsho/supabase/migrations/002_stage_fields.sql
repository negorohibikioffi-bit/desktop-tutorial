-- 進捗メール（事前承認／本承認／申込／契約／電話面談／金消／物件振替／物件確定／オープン）用の日付項目を、
-- いまの設定に「足りんものだけ」追加する。何回流しても重複せん（key が同じなら何もせん）。
-- 既に作った項目（申込日・契約日・金消予定日・決済日 など）は触らん。
-- ※ 追加した項目は、アプリの ⚙ 設定で名前・順番・表示を自由に変えられる。

do $$
declare
  s    jsonb;
  f    jsonb;
  newf jsonb := '[
    {"key":"jizen",   "label":"事前承認日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"honsho",  "label":"本承認日",     "type":"date",     "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"moushi",  "label":"申込日",       "type":"date",     "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"keiyaku", "label":"契約日",       "type":"datetime", "sub":true,  "progress":true,  "print":true, "options":[]},
    {"key":"denwa",   "label":"電話面談日",   "type":"datetime", "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"kinsho",  "label":"金消予定日",   "type":"datetime", "sub":true,  "progress":true,  "print":true, "options":[]},
    {"key":"furikae", "label":"物件振替日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"kakutei", "label":"物件確定日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[]},
    {"key":"open",    "label":"オープン日",   "type":"date",     "sub":false, "progress":false, "print":true, "options":[]}
  ]'::jsonb;
begin
  select settings into s from public.axia_kinsho_settings where id = 1;
  if s is null then return; end if;
  for f in select * from jsonb_array_elements(newf) loop
    if not exists (select 1 from jsonb_array_elements(s->'fields') e where e->>'key' = f->>'key') then
      s := jsonb_set(s, '{fields}', (s->'fields') || jsonb_build_array(f));
    end if;
  end loop;
  update public.axia_kinsho_settings set settings = s, updated_at = now() where id = 1;
end $$;
