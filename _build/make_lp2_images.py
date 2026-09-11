# -*- coding: utf-8 -*-
"""会社紹介LP(/lp/)の画像を作る（開発ツール。公開しない）。

  python _build/make_lp2_images.py

元のPNGは3枚で5.3MBあった。表示は幅800px前後なのに原寸1536pxで、
必要な画素の4倍近くを送っていた。

抽象イラストは非可逆WebPが得意な絵柄。ロゴだけは文字を含むため可逆にする
（文字は非可逆圧縮の輪郭にノイズが乗る・型として /ai-business/ と同じ判断）。

ロゴは表示幅ごとに書き出す。1枚(500px)をブラウザに116pxまで縮めさせると
4.3倍の縮小になり、ブラウザの縮小は画質より速さを取るため、マークの白い線が
潰れて滲んで見えた（柴田指摘 2026-09-12）。原寸(1500px)から表示幅ちょうどに
Lanczosで縮め、軽く輪郭を立てる。強く立てると円の縁に白い輪が出るので控えめにする。
"""
import os
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LP = os.path.join(ROOT, "lp", "assets")

# (元のPNG, 書き出す幅, 可逆で書くか)
TARGETS = [
    ("shinai-editorial-art.png", 1200, False),
    ("shinai-work-flow.png", 1200, False),
    ("shinai-together.png", 1200, False),
]
QUALITY = 88

# 表示幅 116px(PC)・104px(スマホ)・92px(フッター) × 画素密度 1〜3 を、
# 縮小率 1.26 倍以内で賄う組。srcset の幅指定からブラウザが選ぶ。
LOGO_SRC = "shinai-logo.png"
LOGO_WIDTHS = [92, 116, 174, 232, 348]
LOGO_FALLBACK = 232
LOGO_SHARPEN = dict(radius=0.6, percent=80, threshold=0)


def logo_at(master, width):
    h = round(master.size[1] * width / master.size[0])
    # 透過のまま縮めると縁に暗い滲みが出るため、乗算済みの形で縮める
    im = master.convert("RGBa").resize((width, h), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(**LOGO_SHARPEN)).convert("RGBA")


def make_logos():
    master = Image.open(os.path.join(LP, LOGO_SRC)).convert("RGBA")
    out_dir = os.path.join(LP, "logo")
    os.makedirs(out_dir, exist_ok=True)
    for w in LOGO_WIDTHS:
        im = logo_at(master, w)
        im.save(os.path.join(out_dir, "shinai-logo-%d.webp" % w), "WEBP", lossless=True, method=6)
        if w == LOGO_FALLBACK:
            im.save(os.path.join(out_dir, "shinai-logo-%d.png" % w), optimize=True)
        print("  logo/shinai-logo-%-4d %sx%s" % (w, *im.size))


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
    make_logos()


if __name__ == "__main__":
    main()
