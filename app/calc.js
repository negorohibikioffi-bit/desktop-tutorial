// 収支シミュレーション計算ロジック（Excel「入力用」シートの数式をそのまま移植）
(function (root) {
  // Excel ROUND(x,-5): 0から遠ざかる方向への四捨五入
  function roundHalfAway(x, digits) {
    const f = Math.pow(10, -digits); // digits=-5 -> 100000
    const v = Math.abs(x) / f;
    const r = Math.floor(v + 0.5 + 1e-9);
    return Math.sign(x) * r * f;
  }
  // Excel PV(rate,nper,-pmt) と同じ
  function pv(rate, nper, pmt) {
    if (rate === 0) return pmt * nper;
    return pmt * (1 - Math.pow(1 + rate, -nper)) / rate;
  }
  // Excel -PMT(rate,nper,pv)
  function pmt(rate, nper, p) {
    if (rate === 0) return p / nper;
    return p * rate / (1 - Math.pow(1 + rate, -nper));
  }
  const STEP = 5000; // C6=B6+5000, D6=C6+5000

  function calc(p) {
    const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
    const rent = n(p.rent), rate = n(p.rate), years = n(p.years);
    const G3 = p.mode === 'サブリース' ? 0 : rent * 0.033;     // 賃管手数料（賃料×3.3%）
    const H3 = G3 + n(p.mgmt) + n(p.repair) + n(p.other);     // 費用合計
    const base = n(p.base);
    const B6 = base * -1, C6 = B6 + STEP, D6 = C6 + STEP;     // 収支
    const cols = [B6, C6, D6].map((inc) => {
      const loan = rent - H3 - inc;                           // ローン月返済
      const price = roundHalfAway(pv(rate / 12, years * 12, loan), -5) / 10000; // 販売金額(万円)
      const real = rent - H3 - pmt(rate / 12, years * 12, price * 10000);       // 実質収支
      const propEval = n(p.prop);
      let mult = propEval ? (price * 10000) / propEval : 0;    // プロップ倍率(IFERROR→0)
      if (!isFinite(mult)) mult = 0;
      const width = price - n(p.vendor) / 10000;               // 幅
      return { income: inc, loan, price, real, mult, width };
    });
    return {
      G3, H3, cols,
      c3: cols[0].price * 10000 - 7500000,                    // C3: 販売①-750万
    };
  }

  // H12: 築年数（Excelは日数差を表示。G11が日付）
  function age(dateStr, today) {
    if (!dateStr) return '';
    const d = (new Date(today || Date.now()) - new Date(dateStr)) / 86400000;
    return d < 365 ? '新築' : Math.floor(d);
  }
  const api = { calc, age, roundHalfAway };
  if (typeof module !== 'undefined') module.exports = api; else root.AxiaCalc = api;
})(this);
