// メール取り込みの「判断・検証」部分。ネットワークにも DB にも触らん純粋な関数だけ。
// （Node でもテストできるよう、Deno 固有の API は使わん）

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'datetime' | 'money';
  options?: string[];
};

// AI が返す「このフィールドをこうしたい」の1件
export type Update = { key: string; date?: string; time?: string; text?: string };

export type Change = { before: unknown; after: unknown };

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** 日本時間の「今日」。年なしの日付（「11/23」など）を補完する基準にする */
export function jstToday(now = new Date()): { iso: string; weekday: string } {
  const j = new Date(now.getTime() + 9 * 3600e3);
  const iso = j.toISOString().slice(0, 10);
  return { iso, weekday: WD[j.getUTCDay()] };
}

/** 取り込み対象の月の範囲（前月〜3か月先）。axia_kinsho.month は 'YYYY-MM' */
export function monthRange(now = new Date()): { from: string; to: string } {
  const j = new Date(now.getTime() + 9 * 3600e3);
  const ym = (d: Date) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  const at = (n: number) => new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + n, 1));
  return { from: ym(at(-1)), to: ym(at(3)) };
}

export function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 2020 && y <= 2100;
}

const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** AI の1件をアプリの保存形式に直す。形式がおかしい・選択肢にない値は捨てる */
export function toFieldValue(f: FieldDef, u: Update):
  { ok: true; value: unknown } | { ok: false; why: string } {
  switch (f.type) {
    case 'date':
      return isRealDate(u.date) ? { ok: true, value: u.date } : { ok: false, why: `${f.label}：日付の形式が不正` };
    case 'datetime': {
      if (!isRealDate(u.date)) return { ok: false, why: `${f.label}：日付の形式が不正` };
      const t = isTime(u.time) ? u.time : '';
      return { ok: true, value: { d: u.date, t, none: false } };
    }
    case 'select': {
      const v = (u.text ?? '').trim();
      return (f.options ?? []).includes(v) ? { ok: true, value: v } : { ok: false, why: `${f.label}：選択肢にない値「${v}」` };
    }
    case 'money': {
      const n = String(u.text ?? '').replace(/[^\d.]/g, '');
      return n && !isNaN(Number(n)) ? { ok: true, value: n } : { ok: false, why: `${f.label}：金額が読み取れない` };
    }
    default: {
      const v = (u.text ?? '').trim().slice(0, 200);
      return v ? { ok: true, value: v } : { ok: false, why: `${f.label}：空の値` };
    }
  }
}

/** 更新候補を検証して、「変更前→変更後」の一覧にする（すでに同じ値のものは除く） */
export function buildChanges(defs: FieldDef[], updates: Update[], current: Record<string, unknown>) {
  const changes: Record<string, Change> = {};
  const skipped: string[] = [];
  for (const u of updates ?? []) {
    const f = defs.find((d) => d.key === u?.key);
    if (!f) { skipped.push(`未知の項目 ${String(u?.key)}`); continue; }
    const r = toFieldValue(f, u);
    if (!r.ok) { skipped.push(r.why); continue; }
    if (sameValue(current[f.key], r.value)) continue;
    changes[f.key] = { before: current[f.key] ?? null, after: r.value };
  }
  return { changes, skipped };
}

/** 人が読む用の短い表記（要約に使う） */
export function describe(f: FieldDef, v: unknown): string {
  if (v == null || v === '') return '（空）';
  if (f.type === 'datetime' && typeof v === 'object') {
    const o = v as { d?: string; t?: string };
    return (o.d ?? '') + (o.t ? ' ' + o.t : '');
  }
  if (f.type === 'money') return v + '万円';
  return String(v);
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '');

/**
 * 「このメールは本当にその案件の話か」を機械的に確かめる。
 * 物件名・名前・号室のうち、メール内に実在するものの数を返す（AIの思い込み対策）。
 */
export function identityHits(
  row: { name?: string; fields?: Record<string, unknown> },
  defs: FieldDef[],
  mailText: string,
): number {
  const text = norm(mailText);
  let hits = 0;
  const name = norm(row.name ?? '');
  if (name) {
    const surname = norm((row.name ?? '').split(/[\s　]+/)[0] ?? '');
    if (text.includes(name) || (surname.length >= 2 && text.includes(surname))) hits++;
  }
  for (const f of defs) {
    if (f.type !== 'text') continue;
    const v = norm(String((row.fields ?? {})[f.key] ?? ''));
    if (!v) continue;
    if (/物件/.test(f.label) && v.length >= 2 && text.includes(v)) hits++;
    else if (/号室|部屋/.test(f.label) && v.length >= 3 && text.includes(v)) hits++;
  }
  return hits;
}

/** AI に渡す案件の一覧（項目名つきで読みやすく） */
export function compactRows(
  rows: { id: number; month: string; name?: string; fields?: Record<string, unknown> }[],
  defs: FieldDef[],
) {
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const f of defs) {
      const v = (r.fields ?? {})[f.key];
      if (v != null && v !== '') out[f.label] = describe(f, v);
    }
    return { id: r.id, 月: r.month, 名前: r.name ?? '', ...out };
  });
}
