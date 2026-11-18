-- 項目構成(元アプリと同じ)。SQL Editor で実行。既存の行があれば上書き。
insert into public.axia_kinsho_auto_settings (id, settings) values (1, $$
{
  "appTitle": "金消予定日 一覧",
  "subTitle": "AXIA JAPAN ／ 仕入れ事業部",
  "nameLabel": "名前",
  "mainKey": "kinsho",
  "fields": [
    {"key":"room","label":"部屋番号","type":"text","sub":true,"progress":false,"print":true,"options":[]},
    {"key":"bukken","label":"物件名","type":"select","sub":true,"progress":false,"print":true,"options":["AXIA CITY神戸松原","AXIA M-CITY大阪瑞光","AXIA M-CITY浮間公園","エスリード名城公園","スプレスター志村坂上","リヴシティ横濱宮本町","グラン・リヴェール川崎WEST"]},
    {"key":"bank","label":"銀行","type":"select","sub":true,"progress":false,"print":true,"options":["楽天","SBJ","イオン","SBI"]},
    {"key":"bukken_reg","label":"物件登録","type":"select","sub":false,"progress":true,"print":true,"options":["○","×"]},
    {"key":"shonin","label":"承認日","type":"date","sub":false,"progress":true,"print":true,"options":[]},
    {"key":"keiyaku","label":"契約日","type":"datetime","sub":false,"progress":true,"print":true,"options":[]},
    {"key":"toki","label":"登記依頼","type":"select","sub":false,"progress":true,"print":true,"options":["○","×"]},
    {"key":"tachiai","label":"立会","type":"select","sub":true,"progress":false,"print":true,"options":["家原","深谷"]},
    {"key":"kinsho","label":"金消予定日","type":"datetime","sub":true,"progress":true,"print":true,"options":[]},
    {"key":"tanto","label":"担当","type":"text","sub":true,"progress":false,"print":true,"options":[]},
    {"key":"doko","label":"同行","type":"text","sub":true,"progress":false,"print":true,"options":[]},
    {"key":"genpaku","label":"減額","type":"select","sub":false,"progress":false,"print":true,"options":["○","×"]},
    {"key":"tatemono","label":"建物管理","type":"text","sub":false,"progress":false,"print":false,"options":[]},
    {"key":"chinkan","label":"賃貸管理","type":"text","sub":false,"progress":true,"print":false,"options":[]}
  ]
}
$$::jsonb)
on conflict (id) do update set settings = excluded.settings, updated_at = now();
