"""
横スクロール(左右ずれ)検査。

全ページ × 代表的なモバイル幅で、各要素の右端がビューポート幅を超えていないかを
1要素ずつ実測する。

document.scrollWidth の比較では検出できない。はみ出した要素が position:fixed の
場合や、親が overflow を持つ場合、文書全体の scrollWidth には現れないため。
実際にこれで2回誤診した(開発の型18)。

Safari固有の挙動を拾うため既定は WebKit。

使い方:
    node _build/build.mjs
    python tools/check_overflow.py

前提: pip install playwright && python -m playwright install webkit
終了コード: はみ出しがあれば 1
"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parent.parent / "dist"
PORT = 8899
WIDTHS = [320, 375, 390, 414]
PAGES = [
    "index", "about", "services", "industries", "faq", "contact",
    "news", "news-20251205-takasaki-press", "privacy", "terms",
]

# ビューポート右端をはみ出す要素を列挙する。
# position:fixed と非表示は除外する(画面外に待機する閉じたドロワー等は
# 横スクロールの原因にならない)。
FIND_OVERFLOW = """
() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll("body *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.visibility === "hidden" || cs.display === "none") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 0.5) {
      out.push({
        cls: (el.className || "").toString().slice(0, 50),
        tag: el.tagName.toLowerCase(),
        over: Math.round(r.right - vw),
        txt: (el.textContent || "").trim().slice(0, 24),
      });
    }
  });
  return out;
}
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """アクセスログを出さない(検査結果だけを読ませる)。"""

    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(DIST))
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    if not DIST.is_dir():
        print("dist/ がない。先に node _build/build.mjs を実行する。", file=sys.stderr)
        return 1

    engine_name = "chromium" if "--chromium" in sys.argv else "webkit"
    httpd = serve()
    failures = 0

    try:
        with sync_playwright() as p:
            browser = getattr(p, engine_name).launch()
            for width in WIDTHS:
                page = browser.new_page(viewport={"width": width, "height": 844})
                page.emulate_media(reduced_motion="reduce")
                width_ng = 0
                for name in PAGES:
                    page.goto(f"http://127.0.0.1:{PORT}/{name}.html", wait_until="networkidle")
                    page.wait_for_timeout(250)
                    for b in page.evaluate(FIND_OVERFLOW):
                        width_ng += 1
                        print(f'  NG [{width}px] {name}.html <{b["tag"]} class="{b["cls"]}"> '
                              f'+{b["over"]}px "{b["txt"]}"')
                if width_ng == 0:
                    print(f"  OK [{width}px] 全{len(PAGES)}ページではみ出しなし")
                failures += width_ng
                page.close()
            browser.close()
    finally:
        httpd.shutdown()

    if failures:
        print(f"\n横方向のはみ出し {failures} 件。開発の型18を参照。", file=sys.stderr)
        print("word-break:keep-all / white-space:nowrap が狭幅で伸び続けていないか確認する。",
              file=sys.stderr)
        return 1

    print(f"\n横スクロールなし ({engine_name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
