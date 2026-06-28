# -*- coding: utf-8 -*-
# ShinAI Website v2 — ブランド画像生成(開発ツール。公開しない)
# OGP(1200x630)とファビコン(知識の網モチーフ)を生成する。
# 配色は tokens.css に対応(藍 #16233F / 濃藍 #0E1830 / 銅 #C08C54)。
import os
import math
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IMG = os.path.join(ROOT, "assets", "images")
ICON = os.path.join(ROOT, "assets", "icons")
os.makedirs(IMG, exist_ok=True)
os.makedirs(ICON, exist_ok=True)

FONTS = "C:/Windows/Fonts/"
GEO_B = FONTS + "georgiab.ttf"
YU_M = FONTS + "YuGothM.ttc"
YU_B = FONTS + "YuGothB.ttc"

INK = (22, 35, 63)
INK_DEEP = (14, 24, 48)
INK_HI = (30, 46, 80)
COPPER = (192, 140, 84)
WHITE = (255, 255, 255)
MIST = (199, 206, 220)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(w, h, top, mid, bot):
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        if t < 0.5:
            c = lerp(top, mid, t / 0.5)
        else:
            c = lerp(mid, bot, (t - 0.5) / 0.5)
        d.line([(0, y), (w, y)], fill=c)
    return img


def add_glow(img, cx, cy, radius, color, strength):
    w, h = img.size
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.5))
    return Image.blend(img, ImageChops_screen(img, glow), strength)


def ImageChops_screen(a, b):
    from PIL import ImageChops
    return ImageChops.screen(a, b)


def particle_layer(w, h, seed=7):
    rnd = random.Random(seed)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    nodes = []
    for _ in range(64):
        x = rnd.uniform(0, w)
        y = rnd.uniform(0, h)
        nodes.append((x, y))
    # 近接リンク(淡い)
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            dx = nodes[i][0] - nodes[j][0]
            dy = nodes[i][1] - nodes[j][1]
            dist = math.hypot(dx, dy)
            if dist < 150:
                a = int(28 * (1 - dist / 150))
                d.line([nodes[i], nodes[j]], fill=(150, 190, 255, a), width=1)
    # ノード
    for k, (x, y) in enumerate(nodes):
        accent = (k % 9 == 0)
        r = rnd.uniform(1.2, 3.2)
        if accent:
            col = COPPER + (220,)
            r += 0.6
        else:
            col = rnd.choice([(116, 168, 255), (32, 231, 196), (230, 238, 255)]) + (rnd.randint(120, 210),)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    return layer


def make_ogp():
    w, h = 1200, 630
    img = vertical_gradient(w, h, INK_DEEP, INK, INK_HI).convert("RGB")
    img = add_glow(img, int(w * 0.74), int(h * 0.30), 360, (40, 70, 130), 0.55)
    img = img.convert("RGBA")
    img.alpha_composite(particle_layer(w, h))
    d = ImageDraw.Draw(img)

    pad = 90
    # eyebrow
    f_eye = ImageFont.truetype(GEO_B, 24)
    eyebrow = "T A C I T   K N O W L E D G E   I N T O   A I"
    d.text((pad, 150), eyebrow, font=f_eye, fill=COPPER)

    # wordmark ShinAI
    f_word = ImageFont.truetype(GEO_B, 118)
    x = pad
    y = 196
    d.text((x, y), "Shin", font=f_word, fill=WHITE)
    wlen = d.textlength("Shin", font=f_word)
    d.text((x + wlen, y), "AI", font=f_word, fill=COPPER)

    # copper rule
    d.line([(pad + 4, 356), (pad + 150, 356)], fill=COPPER, width=3)

    # tagline JP
    f_tag = ImageFont.truetype(YU_B, 50)
    d.text((pad, 392), "企業の暗黙知を、使えるAI資産へ。", font=f_tag, fill=(238, 242, 249))

    # subline
    f_sub = ImageFont.truetype(YU_M, 30)
    d.text((pad, 470), "暗黙知のAI化  /  企業専用AIエージェント  /  AI内製化・運用支援", font=f_sub, fill=MIST)

    img.convert("RGB").save(os.path.join(IMG, "ogp.png"), "PNG", optimize=True)
    print("wrote ogp.png")


def make_mark(size):
    # 知識の網: 角丸の藍地に、結ばれたノード。一点を銅に。
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=INK_DEEP)
    # 内側の淡い藍グラデ感(中心を少し明るく)
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([s * 0.1, s * 0.0, s * 0.95, s * 0.85], fill=(30, 46, 80, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.12))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)

    nodes = {
        "a": (s * 0.30, s * 0.34),
        "b": (s * 0.68, s * 0.28),
        "c": (s * 0.72, s * 0.66),
        "d": (s * 0.33, s * 0.70),
        "e": (s * 0.52, s * 0.50),
    }
    links = [("a", "e"), ("b", "e"), ("c", "e"), ("d", "e"), ("a", "b"), ("c", "d")]
    for u, v in links:
        d.line([nodes[u], nodes[v]], fill=(150, 190, 255, 150), width=max(2, int(s * 0.012)))
    order = ["a", "b", "c", "d", "e"]
    for k in order:
        x, y = nodes[k]
        if k == "e":
            col = COPPER + (255,)
            r = s * 0.075
        elif k == "b":
            col = (230, 238, 255, 255)
            r = s * 0.052
        else:
            col = (150, 190, 255, 235)
            r = s * 0.05
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    img = img.resize((size, size), Image.LANCZOS)
    return img


def make_icons():
    make_mark(512).save(os.path.join(ICON, "favicon.png"), "PNG", optimize=True)
    make_mark(180).save(os.path.join(ICON, "apple-touch-icon.png"), "PNG", optimize=True)
    make_mark(512).save(os.path.join(ICON, "icon-512.png"), "PNG", optimize=True)
    make_mark(192).save(os.path.join(ICON, "icon-192.png"), "PNG", optimize=True)
    print("wrote icons")


if __name__ == "__main__":
    make_ogp()
    make_icons()
    print("done")
