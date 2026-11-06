/* イオン銀行 区分地図（東京）の文字配置と色から、駅名のエリアを探す */
(function (root) {
  const NAMES = ['', '青', '赤', '黄', '緑'];
  let IDX = null;
  function build() {
    const D = root.ION_CHARS; if (!D) return null;
    const n = D.t.length, by = {};
    for (let i = 0; i < n; i++) (by[D.t[i]] = by[D.t[i]] || []).push(i);
    IDX = { D, by, n };
    return IDX;
  }
  function near(D, by, ch, x, y, s, test) {
    const L = by[ch] || [];
    return L.filter(j => Math.abs(D.s[j] - s) < 6 && test(D.x[j] - x, D.y[j] - y));
  }
  // 駅名 q（正規化済み）に一致する並びを探し、色の集計を返す
  function findPos(q) {
    const I = IDX || build(); if (!I || q.length < 2) return [];
    const { D, by } = I, found = [];
    for (const i of by[q[0]] || []) {
      const s = D.s[i];
      // 2文字目の候補から向きと字間を決める
      for (const j of near(D, by, q[1], D.x[i], D.y[i], s, (dx, dy) => (Math.abs(dy) < s * .3 && Math.abs(dx) >= s * .6 && Math.abs(dx) <= s * 2.4 && dx > 0) || (Math.abs(dx) < s * .3 && Math.abs(dy) >= s * .6 && Math.abs(dy) <= s * 2.4 && dy > 0))) {
        const sx = D.x[j] - D.x[i], sy = D.y[j] - D.y[i], idx = [i, j];
        let ok = true, cur = j;
        for (let k = 2; k < q.length && ok; k++) {
          const nx = D.x[cur] + sx, ny = D.y[cur] + sy;
          const c = near(D, by, q[k], nx, ny, s, (dx, dy) => Math.abs(dx) < s * .4 && Math.abs(dy) < s * .4);
          if (c.length) { cur = c[0]; idx.push(cur); } else ok = false;
        }
        if (!ok) continue;
        // 前後に同じ並びの文字が続く場合は、より長い駅名の一部とみなして除く
        const ext = (px, py) => { for (let t = 0; t < I.n; t++) { if (Math.abs(D.s[t] - s) < 6 && Math.abs(D.x[t] - px) < s * .35 && Math.abs(D.y[t] - py) < s * .35) return true } return false };
        const stepLen = Math.hypot(sx, sy);
        if (stepLen < s * 1.25) { if (ext(D.x[i] - sx, D.y[i] - sy) || ext(D.x[cur] + sx, D.y[cur] + sy)) continue }
        const cnt = {}; idx.forEach(t => { const c = D.c[t]; if (c !== '0') cnt[c] = (cnt[c] || 0) + 1 });
        const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        if (best) found.push({ c: NAMES[best], x: D.x[i], y: D.y[i], s });
      }
    }
    return found;
  }
  function find(q) {
    const I = IDX || build(); if (!I || q.length < 2) return null;
    const direct = findPos(q).map(r => r.c);
    if (direct.length) return direct;
    // 2行に分かれた駅名（例：武蔵／小金井）は、近くにある2つの並びが同じ色なら同じ駅とみなす
    const out = [];
    for (let k = 2; k <= q.length - 2; k++) {
      const A = findPos(q.slice(0, k)), B = findPos(q.slice(k));
      for (const a of A) for (const b of B) if (a.c === b.c && Math.hypot(a.x - b.x, a.y - b.y) < a.s * 4.5) out.push(a.c);
    }
    return out;
  }
  root.ionFind = find;
  if (typeof module !== 'undefined') module.exports = { find };
})(typeof globalThis !== 'undefined' ? globalThis : this);
