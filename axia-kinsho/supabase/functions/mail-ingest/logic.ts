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

/* ===================================================================
 * ルールだけで読み取る（AI不要・無料・メール本文を外に出さない）
 * 型の決まったメールだけ拾う。当てはまらんメールは null を返す。
 * =================================================================== */

export type RuleResult = {
  relevant: boolean;         // false＝「このメールは対象外」と確定
  reason: string;
  propertyText: string;      // 案件を探すための文章（物件名・号室が入っとる所）
  updates: Update[];
  dateIsFallback?: boolean;  // 日付が件名にも本文にも無く、受信日で代用した（＝すでに入っとる日付は上書きせん）
  // 【申込】メール用：物件名・号室で既存カードを探し、無ければ create.fields で新規作成する
  application?: {
    bukkenKey: string; roomKey: string; bukken: string; room: string;
    create: Record<string, unknown>;          // 新規作成するときの初期値（key → 保存形式の値）
    correction: boolean;                      // 「再送」「訂正」など、前のメールの物件名の誤りを直すメールか
  };
};

/** 進捗メールの種類 → 埋める日付項目（項目名の正規表現。上から順に探す）と、本文で日付を探すキーワード */
export const STAGES: { name: string; fields: RegExp[]; kw: string }[] = [
  { name: '事前承認', fields: [/事前承認/], kw: '事前承認' },
  { name: '本承認', fields: [/本承認/, /^承認/], kw: '本承認' },
  { name: '申込', fields: [/申込/], kw: '申込' },
  { name: '契約', fields: [/契約日/, /契約/], kw: '契約' },
  { name: '電話面談', fields: [/電話面談/, /面談/], kw: '面談' },
  { name: '金消', fields: [/金消/], kw: '金消' },
  { name: '物件振替', fields: [/振替/], kw: '振替' },
  { name: '物件確定', fields: [/物件確定/, /確定/], kw: '確定' },
  { name: 'オープン', fields: [/オープン/], kw: 'オープン' },
];

/** 「11月30日 14:00」「2026/11/30」などを {d, t} に。年が無ければ受信日から補う */
export function parseDateTime(s: string, mailIso: string): { d: string; t: string } | null {
  const m = s.normalize('NFKC').match(/(?:(\d{4})[年\/.-])?(\d{1,2})[月\/.-](\d{1,2})日?(?:\s*[（(][^）)]*[）)])?(?:\s*(\d{1,2})[:時](\d{2})?)?/);
  if (!m) return null;
  const base = isRealDate(mailIso) ? mailIso : jstToday().iso;
  let y = m[1] ? Number(m[1]) : Number(base.slice(0, 4));
  const mm = Number(m[2]), dd = Number(m[3]);
  let d = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (!m[1] && isRealDate(d) && new Date(d).getTime() < new Date(base).getTime() - 180 * 86400e3) {
    y += 1; d = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  if (!isRealDate(d)) return null;
  const hh = m[4] !== undefined ? Number(m[4]) : -1, mi = m[5] !== undefined ? Number(m[5]) : 0;
  const t = hh >= 0 && hh <= 23 && mi >= 0 && mi <= 59 ? `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : '';
  return { d, t };
}

/** 本文の中でキーワードの直後（40字以内）に出てくる日付部分を返す */
export function findAfterKeyword(body: string, kw: string): string {
  const text = body.normalize('NFKC');
  const i = text.indexOf(kw);
  return i < 0 ? '' : text.slice(i + kw.length, i + kw.length + 40);
}

const isDateField = (f: FieldDef) => f.type === 'date' || f.type === 'datetime';
const pad2 = (n: string | number) => String(n).padStart(2, '0');

export function ruleExtract(
  m: { from: string; subject: string; body: string; dateIso: string },
  defs: FieldDef[],
): RuleResult | null {
  const subject = m.subject.normalize('NFKC');
  const body = m.body.normalize('NFKC');
  const from = m.from.toLowerCase();

  // 0) 進捗メール：件名が「【種類】物件名 号室」（種類は STAGES の9つ）
  const sm = subject.match(new RegExp(`^\\s*(?:(?:re|fw|fwd|再送|訂正|修正)\\s*[:：]?\\s*)*[【\\[]\\s*(${STAGES.map((s) => s.name).join('|')})(?:完了|報告|のご報告|のお知らせ)?\\s*[】\\]]\\s*(.+?)\\s*$`, 'i'));
  if (sm) {
    const stage = STAGES.find((s) => s.name === sm[1])!;
    const isCorrection = /再送|訂正|修正|誤り|間違/.test(subject);   // 物件名などの訂正メール
    let rest = sm[2].split(/[※＊*]/)[0].trim();                  // 末尾の「※物件名に誤りがありました」などの注記は物件名に含めん
    // 件名の末尾に日付（時刻）が付いとれば、それを日付として使う
    const subjDate = parseDateTime(rest.match(/(?:\d{4}[年\/.-])?\d{1,2}[月\/.-]\d{1,2}日?(?:[（(][^）)]*[）)])?(?:\s*\d{1,2}[:時]\d{2}分?)?\s*$/)?.[0] ?? '', m.dateIso);
    rest = rest.replace(/[\s\u3000]*(?:\d{4}[年\/.-])?\d{1,2}[月\/.-]\d{1,2}日?(?:[（(][^）)]*[）)])?(?:\s*\d{1,2}[:時]\d{2}分?)?\s*$/, '');
    const rm = rest.match(/^(.*?)[\s\u3000]*(\d{1,5})\s*(?:号室|号)?\s*$/);
    const bukken = (rm ? rm[1] : rest).trim();
    const room = rm ? rm[2] : '';
    const bf = defs.find((d) => d.type === 'text' && /物件/.test(d.label));
    const rf = defs.find((d) => d.type === 'text' && /号室|部屋/.test(d.label));
    const af = stage.fields.map((re) => defs.find((d) => re.test(d.label) && isDateField(d))).find(Boolean);
    if (!bukken || !bf) return { relevant: true, reason: `${stage.name}のメールだが、物件名を読めんか「物件名」の項目が無い`, propertyText: subject, updates: [] };
    // 日付：件名の日付 ＞ 本文のキーワード直後の日付 ＞ 受信日
    const bodyDate = parseDateTime(findAfterKeyword(body, stage.kw), m.dateIso);
    const dt = subjDate ?? bodyDate ?? (isRealDate(m.dateIso) ? { d: m.dateIso, t: '' } : null);
    const create: Record<string, unknown> = { [bf.key]: bukken };
    if (rf && room) create[rf.key] = room;
    if (af && dt) create[af.key] = af.type === 'datetime' ? { d: dt.d, t: dt.t, none: false } : dt.d;
    return {
      relevant: true,
      reason: `${stage.name}（${bukken}${room ? ' ' + room : ''}）${af ? '' : ` ※「${stage.name}」に当たる日付項目が無いので物件だけ登録`}`,
      propertyText: subject,
      updates: af && dt ? [{ key: af.key, date: dt.d, time: dt.t || undefined }] : [],
      dateIsFallback: !subjDate && !bodyDate,
      application: { bukkenKey: bf.key, roomKey: rf?.key ?? '', bukken, room, create, correction: isCorrection },
    };
  }

  // 1) 電子契約の完了通知（クラウドサイン／GMOサイン）
  const isSign = /cloudsign\.jp|gmosign\.com/.test(from);
  const signDone = /合意締結が完了|電子署名完了|署名完了のお知らせ/.test(subject);
  if (isSign && signDone) {
    const title =
      (subject.match(/[「『](.+?)[」』]/)?.[1]) ??            // クラウドサイン：「書類名」の合意締結が完了しました
      (subject.match(/[（(](.+)[）)]\s*$/)?.[1]) ??            // GMOサイン：電子署名完了のお知らせ（書類名）
      subject;
    if (!/売買契約/.test(title)) {
      return { relevant: false, reason: `売買契約書以外の署名完了（${title.slice(0, 40)}）`, propertyText: title, updates: [] };
    }
    const f = defs.find((d) => /契約日/.test(d.label) && isDateField(d));
    if (!f) return { relevant: true, reason: '売買契約書の締結完了（「契約日」の項目が無いので反映できず）', propertyText: title, updates: [] };
    const d = isRealDate(m.dateIso) ? m.dateIso : '';
    if (!d) return { relevant: true, reason: '締結日が分からんかった', propertyText: title, updates: [] };
    return { relevant: true, reason: `売買契約書の締結完了（${d}）`, propertyText: title, updates: [{ key: f.key, date: d }] };
  }

  // 2) 決済日の確定連絡：「…を【2026年11月30日】にて決済お受けいたしました」など
  const text = `${subject}\n${body}`;
  const km = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[】」』]?\s*(?:に|にて|にて、|に、)?\s*決済(?:を)?(?:お受け|受け|確定|決定|承り)/);
  if (km) {
    const d = `${km[1]}-${pad2(km[2])}-${pad2(km[3])}`;
    const f = defs.find((x) => /決済/.test(x.label) && isDateField(x));
    if (!isRealDate(d)) return { relevant: false, reason: '決済日の日付が読めん', propertyText: text, updates: [] };
    if (!f) return { relevant: true, reason: `決済日の確定（${d}）。「決済日」の項目が無いので反映できず`, propertyText: text, updates: [] };
    return { relevant: true, reason: `決済日の確定（${d}）`, propertyText: text, updates: [{ key: f.key, date: d }] };
  }
  return null;
}

/** メールの文章に出てくる物件名・号室・名前で、いちばん合う案件を1件選ぶ */
export function pickRow<T extends { id: number; name?: string; fields?: Record<string, unknown> }>(
  rows: T[], defs: FieldDef[], text: string,
): { row: T | null; hits: number; unique: boolean } {
  const scored = rows.map((r) => ({ r, h: identityHits(r, defs, text) })).filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
  if (!scored.length) return { row: null, hits: 0, unique: false };
  const unique = scored.length === 1 || scored[0].h > scored[1].h;
  return { row: scored[0].r, hits: scored[0].h, unique };
}

/** 物件名（と号室）が完全に一致する既存カードを探す。複数あれば新しい（id が大きい）方 */
export function findExisting<T extends { id: number; fields?: Record<string, unknown> }>(
  rows: T[], a: { bukkenKey: string; roomKey: string; bukken: string; room: string },
): T | null {
  const hit = rows.filter((r) => {
    const f = r.fields ?? {};
    if (norm(String(f[a.bukkenKey] ?? '')) !== norm(a.bukken)) return false;
    if (a.room && a.roomKey && norm(String(f[a.roomKey] ?? '')) !== norm(a.room)) return false;
    return true;
  });
  return hit.length ? hit.reduce((x, y) => (y.id > x.id ? y : x)) : null;
}

const bigrams = (s: string) => { const a = norm(s), out = new Set<string>(); for (let i = 0; i < a.length - 1; i++) out.add(a.slice(i, i + 2)); return out; };
const jaccard = (x: Set<string>, y: Set<string>) => { let n = 0; x.forEach((v) => { if (y.has(v)) n++; }); const u = x.size + y.size - n; return u ? n / u : 0; };

/** 訂正メール用：号室が同じで、物件名がよく似た既存カードを探す（誤った名前で作られたカードを見つける）。複数なら新しい方 */
export function findSimilar<T extends { id: number; fields?: Record<string, unknown> }>(
  rows: T[], a: { bukkenKey: string; roomKey: string; bukken: string; room: string },
): T | null {
  if (!a.room || !a.roomKey) return null;
  const me = bigrams(a.bukken);
  const hit = rows.filter((r) => {
    const f = r.fields ?? {};
    return norm(String(f[a.roomKey] ?? '')) === norm(a.room) && jaccard(me, bigrams(String(f[a.bukkenKey] ?? ''))) >= 0.6;
  });
  return hit.length ? hit.reduce((x, y) => (y.id > x.id ? y : x)) : null;
}
