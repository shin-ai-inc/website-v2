# about.html — 必要画像メモ

このページはラスタ画像が無くても完全に成立する設計です（肖像は抽象プレースホルダ＋モノグラムで構成）。
以下は「入れられるなら品位が上がる」任意の画像です。無い場合は現状のまま破綻しません。

## 任意（あれば差し替え）
- `assets/images/about-portrait-shibata.webp`
  - 用途: 代表メッセージの肖像。`.about-message__portrait` 内の `<span class="about-message__monogram">柴</span>` と
    `<figcaption>` を、`<img src="assets/images/about-portrait-shibata.webp" alt="ShinAI 代表 柴田昌国">` に置換すれば
    CSS（object-fit: cover）でそのまま収まる。
  - 条件: 作り物っぽいストック顔写真は不可。実物の落ち着いた人物写真、または抽象的で上品な構図のみ。
    縦長 4:5 推奨。商用利用可・帰属の扱いを `assets/CREDITS.md` に記録すること。

## 不要
- チーム（CTO Y氏）は匿名のため写真を置かない。モノグラム表示で確定。
- 装飾アイコン・背景イラストは不要（淡グラデと余白で構成済み）。
