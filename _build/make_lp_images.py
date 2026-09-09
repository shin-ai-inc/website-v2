# -*- coding: utf-8 -*-
"""ランディングページ(/ai-business/)の画像を作る（開発ツール。公開しない）。

  python _build/make_lp_images.py

元のPNGは1枚1MBあり、ページ全体で2.1MBを転送していた。ランディングページで
この重さは、順位（Core Web Vitals）と離脱率の両方に効く。

WebPへ変換する。図版はいずれも抽象イラストで、品質88でもPSNRが43dBを超える
（40dBを超えれば目視で差は出ない）。容量は96〜97%減る。
古い閲覧環境のために元のPNGは残し、HTML側は <picture> で切り替える。

ロゴだけは寸法も落とす。表示は128pxなのに原寸が1329pxあり、10倍の画素を
送っていた。高精細画面の2倍を見ても500pxで足りる。

なおロゴの原本は、絵柄の範囲まで余白を詰めてある。元は左132px・右39pxと
非対称に空いており、ヘッダーで左右の余白を揃えても左だけ広く見えた。
CSSで打ち消すのではなく、画像の側を直してある（2026-09-09 柴田指摘）。
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LP = os.path.join(ROOT, "ai-business")

QUALITY = 88

# (元のPNG, 書き出す幅。None なら原寸のまま)
TARGETS = [
    ("hero-v5.png", None),
    ("collaboration-v5.png", None),
    ("shinai-logo.png", 500),
]


def main():
    total_before = total_after = 0
    for name, width in TARGETS:
        src_path = os.path.join(LP, name)
        im = Image.open(src_path)
        if width:
            h = round(im.size[1] * width / im.size[0])
            im = im.resize((width, h), Image.LANCZOS)
        out = os.path.join(LP, os.path.splitext(name)[0] + ".webp")
        im.save(out, "WEBP", quality=QUALITY, method=6)
        before, after = os.path.getsize(src_path), os.path.getsize(out)
        total_before += before
        total_after += after
        print("  %-24s %sx%s  %6.0f KB -> %5.0f KB  (-%.0f%%)"
              % (os.path.basename(out), *im.size, before / 1024, after / 1024,
                 (1 - after / before) * 100))
    print("  %-24s %27.0f KB -> %5.0f KB  (-%.0f%%)"
          % ("合計", total_before / 1024, total_after / 1024,
             (1 - total_after / total_before) * 100))


if __name__ == "__main__":
    main()
