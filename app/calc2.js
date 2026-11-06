// イオン銀行簡易計算 / SBJ銀行簡易計算 の計算ロジック（Excelの数式を移植）
(function (root) {
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
  const has = (v) => v !== '' && v != null;
  const rd = (x, d) => { const f = Math.pow(10, -d); return Math.sign(x) * Math.floor(Math.abs(x) / f + 0.5 + 1e-9) * f; }; // ROUND
  const rdown = (x, d) => { const f = Math.pow(10, -d); return Math.sign(x) * Math.floor(Math.abs(x) / f + 1e-9) * f; };   // ROUNDDOWN
  const rup = (x, d) => { const f = Math.pow(10, -d); return Math.sign(x) * Math.ceil(Math.abs(x) / f - 1e-9) * f; };       // ROUNDUP
  const pmt = (rate, n, pv) => rate === 0 ? pv / n : pv * rate / (1 - Math.pow(1 + rate, -n)); // 正の返済額
  const utc = (s) => { const d = new Date(s); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  function edate(ms, m) { const d = new Date(ms); const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return Date.UTC(y, mo, Math.min(day, last)); }
  // 築年数（日）= EDATE(今日,4) - 築年月日
  function ageDays(built, today) {
    if (!has(built)) return null;
    const t = today ? utc(today) : utc(new Date().toISOString().slice(0, 10));
    return Math.round((edate(t, 4) - utc(built)) / 86400000);
  }

  // ===== イオン銀行 =====
  function ionYield(p) {
    const T = root.ION_TABLES, tb = T.tables[p.region]; if (!tb) return { err: '地域が未選択です' };
    const days = ageDays(p.built, p.today); if (days == null) return { err: '築年月日が未入力です' };
    const yrs = Math.ceil(days / 365 - 1e-9);                       // C11 = ROUNDUP(C10/365,0)
    let row = null; for (const r of T.agecode) if (r[0] <= yrs) row = r;   // VLOOKUP近似一致
    if (!row) return { err: '築年数が表の範囲外です' };
    const code = p.walk === '5分以内' ? row[1] : row[2];
    const ai = tb.areas.indexOf(String(p.area || '').replace('エリア', ''));
    if (ai < 0) return { err: 'この地域に該当するエリアがありません' };
    if (code >= tb.rows.length) return { err: 'この条件は表にありません' };
    const v = tb.rows[code][ai];
    if (typeof v !== 'number') return { err: v || '表にありません' };
    return { days, yrs, rate: v / 100, pct: v };
  }
  function ion(p) {
    const y = ionYield(p), o = { y };
    if (has(p.yieldOv)) { y.rate = num(p.yieldOv) / 100; y.pct = num(p.yieldOv); delete y.err; }     // 個別対応などの手入力利回り
    const days = y.days != null ? y.days : ageDays(p.built, p.today);
    o.days = days; o.years = days == null ? null : Math.ceil(days / 365 - 1e-9);
    o.ok = days != null && num(p.sqm) >= 20 && days < 9125 && num(p.units) >= 20;     // C9
    const sub = has(p.sub), shu = has(p.shu);
    o.median = rdown(num(p.sub) / 9 * 10, -1);                                       // C14
    const rentY = shu ? num(p.shu) : o.median;                                        // 利回り計算用賃料
    const std = p.rentBasis !== '中央値換算';
    o.rent = std ? (sub ? num(p.sub) : num(p.shu)) : (sub ? o.median : num(p.shu));   // F8
    o.agent = has(p.agentOv) ? num(p.agentOv) : p.feeMode === '賃料×10%' ? (sub ? num(p.sub) * 0.1 : 3300) : (sub ? 0 : 3300); // F9
    o.kanseki = num(p.mgmt) + num(p.repair);                                          // F10
    o.feeTotal = o.agent + o.kanseki + num(p.other);                                  // H10
    o.rentY = rentY;
    if (has(p.price)) o.price = num(p.price);
    else if (y.rate) o.price = rdown(rentY * 12 / y.rate, -5);
    else o.price = null;
    if (o.price == null) return o;
    const dep = num(p.deposit);
    o.loan = o.price - dep;                                                           // F6
    o.cost = has(p.costOv) ? num(p.costOv) : rdown(o.price * num(p.feeRate), -5);                                     // F7
    const mk = (rate, yrs, amt) => o.rent - o.feeTotal - rd(pmt(rate / 12, yrs * 12, amt), 0);
    o.plans = [
      { label: p.y1 + '年', amount: o.loan, rate: num(p.r1), income: mk(num(p.r1), num(p.y1), o.loan) },
      { label: p.y1 + '年＋諸', amount: o.loan + o.cost, rate: num(p.r2), income: mk(num(p.r2), num(p.y1), o.loan + o.cost) },
      { label: p.y2 + '年', amount: o.loan, rate: num(p.r3), income: mk(num(p.r3), num(p.y2), o.loan) },
      { label: p.y2 + '年＋諸', amount: o.loan + o.cost, rate: num(p.r4), income: mk(num(p.r4), num(p.y2), o.loan + o.cost) },
    ];
    o.gross = rentY * 12 / o.price;                                                   // B19
    o.net = (rentY - num(p.mgmt) - num(p.repair)) * 12 / o.price;                     // B20
    o.width = o.price - num(p.cost);                                                  // B22
    return o;
  }

  // ===== SBJ銀行 =====
  function sbj(p) {
    const days = ageDays(p.built, p.today);
    const sqm = num(p.sqm);
    const ok = days != null && sqm >= 20 && days < 9125 && num(p.units) >= 20;       // D3（TRUE=100%融資の対象）
    const sub = has(p.sub), shu = has(p.shu);
    const D8 = rdown(num(p.sub) / 9 * 10, -1);
    const R = shu ? num(p.shu) : D8;                                                  // 利回り計算用賃料
    const tas = num(p.tas), yld = num(p.yield);
    const B18 = !ok ? 0 : (yld ? rdown(R * 12 / yld, -5) : 0);
    const D18 = ok ? 0 : (yld ? rdown(R * 12 / yld, -5) : 0);
    const B23 = rdown(1.3 * tas, -5), D23 = rdown(1.4 * tas, -5);
    const B19 = B18 < B23 ? B18 : B23;
    const D19 = D18 < D23 ? rdown(D18 * 0.9, -5) : rdown(D23 * 0.9, -5);
    const base = B19 === 0 ? D19 : B19;                                               // 融資評価額
    const rate = num(p.rate);
    const D21 = rup(D19 / 9 * 10, -5);
    const handRent = shu ? num(p.shu) : num(p.sub);
    const tegaki = handRent - num(p.mgmtFee) - num(p.mgmt) - num(p.repair);           // C12 手取賃料
    const repay = rate ? rdown(pmt(rate / 12, 420, base), 0) : 0;                     // C13
    const B21 = B19, mk = num(p.maisoku), sh = num(p.shu);
    const cols = {                                                                    // Excelの B列(100%融資) / D列(90%融資)
      b: { yieldEval: B18, evalAmt: B19, sale: B21, yld: B21 ? sh * 12 / B21 : '', tasX: tas ? B21 / tas : '', cap: B23, width: B19 === 0 ? 0 : B19 - mk },
      d: { yieldEval: D18, evalAmt: D19, sale: D21, yld: D21 ? sh * 12 / D21 : '', tasX: tas ? D21 / tas : '', cap: D23, width: D19 === 0 ? 0 : D19 - mk },
    };
    return {
      cols, days, ok, rate100: ok, B18, D18, B23, D23, B19, D19, base,
      limit: base - num(p.offset),                                                    // D6 仕入れ上限目安
      sale: B19 === 0 ? D21 : B19,                                                    // 販売金額
      yieldSale: (B19 === 0 ? D21 : B19) ? num(p.shu || p.sub) * 12 / (B19 === 0 ? D21 : B19) : '',
      tas: tas ? (B19 === 0 ? D21 : B19) / tas : 0,                                   // TAS倍率
      width: base === 0 ? 0 : base - num(p.maisoku),                                  // 物件幅
      tegaki, repay, income: tegaki - repay,                                          // C14 収支
      kanseki: num(p.mgmt) + num(p.repair),
    };
  }
  const api = { ion, ionYield, sbj, ageDays, pmt };
  if (typeof module !== 'undefined') module.exports = api; else root.AxiaCalc2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
