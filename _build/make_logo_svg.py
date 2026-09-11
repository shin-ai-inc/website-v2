# -*- coding: utf-8 -*-
"""会社紹介LP(/lp/)のロゴを、原寸の画像から図形(SVG)に起こす（開発ツール。公開しない）。

  pip install potracer numpy pillow
  python _build/make_logo_svg.py

画像のロゴは、PC(画素密度1〜1.5)では 116px に 116〜174 画素しか使えず、
マークの白い線が滲んで見えた（柴田指摘 2026-09-12）。スマホ(画素密度3)は同じ大きさに
約350画素を使えるので鮮明だった。画素を足すのではなく、図形にして輪郭をブラウザに
その場で描かせる。

原本 lp/assets/shinai-logo.png (1500x468) の文字(黒)と円(マゼンタ・上から下へわずかに
濃くなる)を別々に輪郭化する。円の中の白い線は透明の抜きなので、evenodd で穴として残る。
2026-09-12 の起こしでは、原本との形の一致率(IoU) 0.984、食い違いはすべて輪郭の±2px 以内
(アンチエイリアスの差)、円の平均色は原本 (195,0,242) に対し (195,1,242)。
"""
import os
import numpy as np
import potrace
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "lp", "assets", "shinai-logo.png")
OUT = os.path.join(ROOT, "lp", "assets", "logo", "shinai-logo.svg")

# 円の色は原本の上端・下端の実測値
DISC_TOP, DISC_BOTTOM = "#CC02F7", "#BA00EE"


def fmt(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def outline(mask):
    # potracer は偽(0)の画素を図形として追う。インクを偽にして渡す
    plist = potrace.Bitmap(~mask).trace(
        turdsize=4, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0, opticurve=True, opttolerance=0.2)
    d = []
    for c in plist:
        s = c.start_point
        d.append("M%s %s" % (fmt(s.x), fmt(s.y)))
        for seg in c.segments:
            e = seg.end_point
            if seg.is_corner:
                d.append("L%s %sL%s %s" % (fmt(seg.c.x), fmt(seg.c.y), fmt(e.x), fmt(e.y)))
            else:
                d.append("C%s %s %s %s %s %s" % (fmt(seg.c1.x), fmt(seg.c1.y),
                                                 fmt(seg.c2.x), fmt(seg.c2.y), fmt(e.x), fmt(e.y)))
        d.append("Z")
    return "".join(d)


def main():
    im = np.array(Image.open(SRC).convert("RGBA")).astype(int)
    h, w = im.shape[:2]
    ink = im[..., 3] > 127
    text = ink & (im[..., 0] < 100)
    disc = ink & (im[..., 0] >= 100)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="ShinAI">\n'
        f'<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{DISC_TOP}"/><stop offset="1" stop-color="{DISC_BOTTOM}"/></linearGradient></defs>\n'
        f'<path fill="#000" fill-rule="evenodd" d="{outline(text)}"/>\n'
        f'<path fill="url(#m)" fill-rule="evenodd" d="{outline(disc)}"/>\n'
        f'</svg>\n')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    print("  logo/shinai-logo.svg  %.1f KB" % (os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
