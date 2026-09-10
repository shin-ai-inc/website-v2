# -*- coding: utf-8 -*-
"""会社紹介LP(/lp/)の画像を作る（開発ツール。公開しない）。

  python _build/make_lp2_images.py

元のPNGは3枚で5.3MBあった。表示は幅800px前後なのに原寸1536pxで、
必要な画素の4倍近くを送っていた。

抽象イラストは非可逆WebPが得意な絵柄。ロゴだけは文字を含むため可逆にする
（文字は非可逆圧縮の輪郭にノイズが乗る・型として /ai-business/ と同じ判断）。
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LP = os.path.join(ROOT, "lp", "assets")

# (元のPNG, 書き出す幅, 可逆で書くか)
TARGETS = [
    ("shinai-editorial-art.png", 1200, False),
    ("shinai-work-flow.png", 1200, False),
    ("shinai-together.png", 1200, False),
    ("shinai-logo.png", 500, True),
]
QUALITY = 88


def main():
    before = after = 0
    for name, width, lossless in TARGETS:
        src = os.path.join(LP, name)
        im = Image.open(src)
        if im.size[0] > width:
            im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
        out = os.path.join(LP, os.path.splitext(name)[0] + ".webp")
        if lossless:
            im.save(out, "WEBP", lossless=True, method=6)
        else:
            im.save(out, "WEBP", quality=QUALITY, method=6)
        b, a = os.path.getsize(src), os.path.getsize(out)
        before += b; after += a
        print("  %-30s %sx%s  %6.0f KB -> %5.0f KB  (-%.0f%%)"
              % (os.path.basename(out), *im.size, b / 1024, a / 1024, (1 - a / b) * 100))
    print("  %-30s %26.0f KB -> %5.0f KB  (-%.0f%%)"
          % ("合計", before / 1024, after / 1024, (1 - after / before) * 100))


if __name__ == "__main__":
    main()
