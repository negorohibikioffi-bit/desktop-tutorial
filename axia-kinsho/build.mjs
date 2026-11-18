// src/app.jsx（JSX）→ app.js（ブラウザでそのまま動くJS）に変換する。
// 端末で毎回 Babel(3MB) を動かさんで済むけん、起動が速くなる。
import { readFileSync, writeFileSync } from 'node:fs';
import Babel from '@babel/standalone';

const src = readFileSync(new URL('./src/app.jsx', import.meta.url), 'utf8');
const { code } = Babel.transform(src, { presets: ['react'], comments: false, compact: false });
writeFileSync(new URL('./app.js', import.meta.url), code);
console.log('built app.js', code.length, 'bytes');
