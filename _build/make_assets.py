# -*- coding: utf-8 -*-
"""ブランドアイコンの生成（開発ツール。公開しない）。

  python _build/make_assets.py

原本 assets/images/logo.png ただ一つから、公開するアイコン一式を作る。
原本は「円の中だけ不透明・線は白」で作ってある。この形なら明るい地でも
暗い地でも同じマークに見える。線まで透過させた版は、暗い地で線が地の色に
沈み、別のマークに見えてしまう（2026-09-09 実測）。

Apple のホーム画面用だけは白地で焼き込む。iOS は透過部分を黒で塗るため、
透過のまま渡すと四隅が黒くなる。

原本はマークの外側に余白を持っている（1500px中、マークは1264px＝84%）。
schema.org の logo として使う分にはそれでよいが、アイコンは画布いっぱいに
描かないとタブの中で小さく見える（16px表示でマークが13.5px・柴田指摘
2026-09-10）。ここで余白を落としてから各寸法を作る。原本そのものは触らない。
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MASTER = os.path.join(ROOT, "assets", "images", "logo.png")
ICON = os.path.join(ROOT, "assets", "icons")

# favicon.ico に収める寸法。48は Google が検索結果で推奨する最小。
ICO_SIZES = [16, 32, 48, 64, 128, 256]


def load_master():
    im = Image.open(MASTER).convert("RGBA")
    if im.size[0] != im.size[1]:
        raise SystemExit("原本が正方形でない: %s" % (im.size,))
    return trim_to_mark(im)


def trim_to_mark(im):
    """マークの外側の余白を落とし、正方形に切り出す。

    切り出しはマークの中心を保った正方形で行う。外接矩形そのままだと縦横比が
    崩れ、正方形のアイコンへ入れたときに円が歪む。
    """
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        return im
    left, top, right, bottom = box
    side = max(right - left, bottom - top)
    cx, cy = (left + right) / 2.0, (top + bottom) / 2.0
    half = side / 2.0
    x0, y0 = int(round(cx - half)), int(round(cy - half))
    x0, y0 = max(0, min(x0, im.size[0] - side)), max(0, min(y0, im.size[1] - side))
    return im.crop((x0, y0, x0 + side, y0 + side))


def down(im, size):
    """縮小は必ず LANCZOS で行う。既定の補間だと小さい寸法で線が溶ける。"""
    return im.resize((size, size), Image.LANCZOS)


def on_white(im):
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im)


def main():
    master = load_master()
    os.makedirs(ICON, exist_ok=True)

    down(master, 256).save(os.path.join(ICON, "favicon.png"), "PNG", optimize=True)
    down(master, 192).save(os.path.join(ICON, "icon-192.png"), "PNG", optimize=True)
    down(master, 512).save(os.path.join(ICON, "icon-512.png"), "PNG", optimize=True)

    # iOS は透過を黒で塗る。ここだけ白地に焼き込む。
    on_white(down(master, 180)).convert("RGB").save(
        os.path.join(ICON, "apple-touch-icon.png"), "PNG", optimize=True)

    # ICO は各寸法を自分で LANCZOS で作って渡す。sizes= だけを指定すると
    # 保存側が内部で縮み、原本からの縮小とずれる（実測 平均差0.3〜0.8）。
    frames = [down(master, s) for s in ICO_SIZES]
    frames[-1].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                    sizes=[(s, s) for s in ICO_SIZES],
                    append_images=frames[:-1])

    for name in ("favicon.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"):
        p = os.path.join(ICON, name)
        print("  %-24s %sx%s  %.0f KB" % (name, *Image.open(p).size, os.path.getsize(p) / 1024))
    p = os.path.join(ROOT, "favicon.ico")
    print("  %-24s %s  %.0f KB" % ("favicon.ico", "/".join(str(s) for s in ICO_SIZES),
                                   os.path.getsize(p) / 1024))


if __name__ == "__main__":
    main()
