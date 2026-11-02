#!/usr/bin/env python3
"""
ジャービス風ボイス生成スクリプト（オリジナル声・試作版）

使い方:
    pip install edge-tts
    # ffmpeg が必要（mac: brew install ffmpeg / Windows: winget install ffmpeg）

    python jarvis_voice.py "響さん、本日の物件契約書のチェックが完了いたしました。"
    python jarvis_voice.py --lang en "Good afternoon, sir. The contract review is complete."
    python jarvis_voice.py --list        # 使える声の一覧

注意:
    edge-tts は Microsoft Edge の読み上げ機能を利用する非公式ライブラリです。
    個人での試作・検証用途として使い、社外公開・商用利用の際は
    OpenAI TTS / Google Cloud TTS / ElevenLabs など、利用規約上OKなサービスに差し替えてください。
    （差し替えるのは synthesize() 関数だけで済みます）
"""
import argparse
import asyncio
import subprocess
import sys
from pathlib import Path

# ---- 声のプリセット --------------------------------------------------------
PRESETS = {
    # 日本語：落ち着いた男性。少しゆっくり・低めで執事っぽく
    "ja": {"voice": "ja-JP-KeitaNeural", "rate": "-14%", "pitch": "-12Hz"},   # 低く・ゆっくり・抑えめ
    # 英語：ブリティッシュ男性。原作のジャービスに近い雰囲気
    "en": {"voice": "en-GB-RyanNeural", "rate": "-10%", "pitch": "-8Hz"},
}

# ---- AIアシスタントらしい質感を出すエフェクト（ffmpeg） ----------------------
# ・低域を少し持ち上げて落ち着いた響きに
# ・高域をほんのり抑えてマイルドに
# ・短いエコーで電子的な空間感を付与
FFMPEG_FILTER = (
    "highpass=f=70,"
    "equalizer=f=150:t=q:w=1.0:g=3.5,"
    "equalizer=f=3500:t=q:w=1.2:g=1.5,"
    "lowpass=f=9000,"
    "aecho=0.8:0.5:20:0.12,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)


async def synthesize(text: str, out_path: Path, lang: str) -> None:
    """テキスト→音声(mp3)。サービスを変える場合はここだけ書き換える。"""
    import edge_tts

    p = PRESETS[lang]
    comm = edge_tts.Communicate(text, p["voice"], rate=p["rate"], pitch=p["pitch"])
    await comm.save(str(out_path))


def apply_effect(src: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", FFMPEG_FILTER, str(dst)],
        check=True,
    )


async def list_voices() -> None:
    import edge_tts

    voices = await edge_tts.list_voices()
    for v in voices:
        if v["Locale"].startswith(("ja-", "en-GB")):
            print(f'{v["ShortName"]:28} {v["Gender"]:7} {v["Locale"]}')


def main() -> int:
    ap = argparse.ArgumentParser(description="ジャービス風ボイス生成")
    ap.add_argument("text", nargs="?", help="読み上げるテキスト")
    ap.add_argument("--lang", choices=PRESETS.keys(), default="ja")
    ap.add_argument("-o", "--out", default="jarvis_out.mp3")
    ap.add_argument("--raw", action="store_true", help="エフェクトなし（素の声）")
    ap.add_argument("--list", action="store_true", help="使える声の一覧を表示")
    args = ap.parse_args()

    if args.list:
        asyncio.run(list_voices())
        return 0
    if not args.text:
        ap.error("読み上げるテキストを指定してください")

    out = Path(args.out)
    raw = out.with_suffix(".raw.mp3")
    asyncio.run(synthesize(args.text, raw, args.lang))
    if args.raw:
        raw.replace(out)
    else:
        apply_effect(raw, out)
        raw.unlink(missing_ok=True)
    print(f"生成しました: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
