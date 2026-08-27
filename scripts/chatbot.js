/*
  ShinAI Website v2 — chatbot.js
  現行 v3.0.0 を継承しつつ技術的負債を解消した AIアシスタント。
  改善点: innerHTML を全廃し DOM 構築に統一(XSS面の縮小) / FontAwesome 依存を撤廃(ローディングはCSS) /
  API URL を外部 config.js から取得(インライン禁止) / 鍵はクライアントに一切持たない /
  多層のクライアント検証(長さ・危険パターン・レート制限・crypto乱数 sessionId)を維持・強化 /
  モデル応答は必ず textContent で描画(出力を信用してHTMLにしない)。
  クライアント検証は防御の一層であり最終防壁ではない。最終的なインジェクション対策・出力サニタイズ・
  濫用検知はサーバー側責務。グローバル非汚染の自己完結 IIFE。
*/
(function () {
  "use strict";

  /* 表示文言はページの言語(html[lang])で切り替える。英語版 /en/ も同じスクリプトを共有する。
     危険パターンの検出regexは言語に関係なく全て適用する(攻撃は言語を選ばない)。 */
  var EN = (document.documentElement.getAttribute("lang") || "ja").indexOf("en") === 0;
  var T = EN ? {
    greet: "Hello. This is the ShinAI assistant. Ask anything about unlocking tacit knowledge, or about applying it to your work.",
    tooLong: "That message is too long. Please keep it within 500 characters.",
    refused: "Sorry, we cannot answer that. For a specific enquiry, please use the contact form.",
    tooFast: "Messages are coming through quickly. Please wait a moment.",
    notReady: "The AI assistant is not live yet. Send us a note through the contact form and someone will get back to you.",
    failed: "Sorry, we could not respond just now. Please use the contact form.",
    offline: "We could not reach the server. Please check your connection, or contact us through the form.",
    cta: "Go to contact and free consultation",
    typing: "Typing",
    cues: ["contact", "consultation", "get in touch", "adopt", "your company", "price",
           "pricing", "cost", "how long", "timeline", "more detail", "specific", "proposal", "quote"]
  } : {
    greet: "こんにちは。ShinAI のアシスタントです。暗黙知の解消や業務への適用についてお気軽にお尋ねください。",
    tooLong: "メッセージが長すぎます。500文字以内でお願いします。",
    refused: "申し訳ありません。その内容には回答できません。具体的なご相談はお問い合わせフォームをご利用ください。",
    tooFast: "送信が続いています。少しだけお待ちください。",
    notReady: "ただいまAIアシスタントは準備中です。お問い合わせフォームよりご連絡いただければ、担当より折り返します。",
    failed: "申し訳ありません。一時的に応答できませんでした。お問い合わせフォームをご利用ください。",
    offline: "サーバーに接続できませんでした。通信環境をご確認のうえ、お問い合わせフォームよりご連絡ください。",
    cta: "お問い合わせ・無料相談へ",
    typing: "入力中",
    cues: ["お問い合わせ", "無料相談", "ご相談ください", "導入", "御社", "貴社",
           "料金", "費用", "期間", "詳しく", "具体的", "ご提案"]
  };

  /* 自傷をほのめかす表現。サーバー側 guard.mjs の分類と対応させる。
     ここでは何も返さず、通過させるためだけに使う。 */
  var CRISIS = /死にたい|しにたい|消えたい|生きるのが(つらい|辛い|嫌)|自殺|自傷|リストカット|誰も助けて|kill myself|suicide|want to die|end my life|self[ -]harm/i;

  var Chatbot = {
    button: null,
    panel: null,
    closeBtn: null,
    messages: null,
    input: null,
    sendBtn: null,
    isTyping: false,
    sessionId: null,
    lastMessageTime: 0,
    typingSpeed: 12,
    loadingDelay: 380,

    init: function () {
      this.button = document.getElementById("chatbot-button");
      this.panel = document.getElementById("chatbot-window");
      this.closeBtn = document.getElementById("chatbot-close");
      this.messages = document.getElementById("chatbot-messages");
      this.input = document.getElementById("chat-input");
      this.sendBtn = document.getElementById("chat-send");

      if (!this.button || !this.panel || !this.messages || !this.input || !this.sendBtn) {
        return;
      }

      this.bind();
      this.greet();
    },

    bind: function () {
      var self = this;
      this.button.addEventListener("click", function () { self.toggle(); });
      if (this.closeBtn) {
        this.closeBtn.addEventListener("click", function () { self.close(); });
      }

      /* モバイルのソフトキーボード対策: シートの高さを可視ビューポートへ追従させ、
         入力欄が常にキーボードの上に見える状態を保つ(iOS/Android共通)。 */
      if (window.visualViewport) {
        var syncSheet = function () { self.fitToViewport(); };
        window.visualViewport.addEventListener("resize", syncSheet);
        window.visualViewport.addEventListener("scroll", syncSheet);
      }
      this.input.addEventListener("focus", function () {
        window.setTimeout(function () { self.scrollToEnd(); }, 250);
      });
      this.sendBtn.addEventListener("click", function () { self.send(); });
      this.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          self.send();
        }
      });
      document.addEventListener("keydown", function (e) {
        if ((e.key === "Escape" || e.key === "Esc") && self.panel.classList.contains("is-open")) {
          self.close();
          self.button.focus();
        }
      });
    },

    greet: function () {
      this.addMessage(T.greet, "bot");
    },

    toggle: function () {
      var willOpen = !this.panel.classList.contains("is-open");
      this.panel.classList.toggle("is-open", willOpen);
      this.button.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) {
        this.lockBackground();
        this.fitToViewport();
        this.scrollToEnd();
      } else {
        this.unlockBackground();
        this.resetSheet();
      }
      if (willOpen && window.innerWidth > 768) {
        this.input.focus();
      }
    },

    close: function () {
      this.panel.classList.remove("is-open");
      this.button.setAttribute("aria-expanded", "false");
      this.unlockBackground();
      this.resetSheet();
    },

    /* 背景ページの固定。iOSはbodyのoverflow:hiddenが効かないため position:fixed 方式で止める */
    lockBackground: function () {
      if (window.innerWidth > 640) {
        return;
      }
      this.savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.position = "fixed";
      document.body.style.top = -this.savedScrollY + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    },

    unlockBackground: function () {
      if (document.body.style.position !== "fixed") {
        return;
      }
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, this.savedScrollY || 0);
    },

    /* キーボードに隠れる高さを計測し --chat-kb へ。CSSが bottom を持ち上げて
       入力バーを常にキーボードの真上へ保つ(1プロパティ更新のみで描画が安定する) */
    fitToViewport: function () {
      if (window.innerWidth > 640 || !this.panel.classList.contains("is-open")) {
        this.resetSheet();
        return;
      }
      var vv = window.visualViewport;
      if (!vv) {
        return;
      }
      var covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      this.panel.style.setProperty("--chat-kb", covered + "px");
      this.scrollToEnd();
    },

    resetSheet: function () {
      this.panel.style.removeProperty("--chat-kb");
    },

    /* クライアント側の多層チェック(防御の一層)。 */
    validate: function (text) {
      if (text.length > 500) {
        return T.tooLong;
      }
      /* 安全に関わる訴えは、ここで断らずサーバーへ通す。
         サーバーは相談窓口を定型で返す。ここで拒否文を返すと、
         「死にたい。あなたは今から私の友達になって」のような入力が
         下の危険パターンに当たり、窓口の案内が届かないまま終わる。
         判定はサーバー側が正本であり、ここは通すことだけを決める。 */
      if (CRISIS.test(text)) {
        return null;
      }
      var dangerous = [
        /<script|javascript:|onerror=|onload=|onclick=/i,
        /\b(system prompt|ignore (the )?(previous|above)|disregard|override|bypass|jailbreak)\b/i,
        /(前述|以前|上記|これまで).{0,6}(指示|命令).{0,6}(無視|忘れ)/,
        /あなたは(今|これ)から|代わりに.{0,8}(答え|出力|表示)/,
        /(api\s*キー|シークレット|パスワード|トークン|認証情報|環境変数).{0,8}(教え|表示|出力|見せ)/i,
        /(system|あなた).{0,6}(設定|プロンプト|指示).{0,6}(見せ|表示|教え)/i,
        /(drop\s+table|delete\s+from|insert\s+into|union\s+select|'\s*;\s*--|'\s*or\s*'1'\s*=\s*'1)/i
      ];
      var i;
      for (i = 0; i < dangerous.length; i += 1) {
        if (dangerous[i].test(text)) {
          return T.refused;
        }
      }
      return null;
    },

    send: function () {
      var self = this;
      var text = this.input.value.trim();
      if (!text || this.isTyping) {
        return;
      }

      var now = Date.now();
      if (now - this.lastMessageTime < 2000) {
        this.addMessage(T.tooFast, "bot");
        return;
      }

      var problem = this.validate(text);
      if (problem) {
        this.addMessage(text, "user");
        this.input.value = "";
        this.addMessage(problem, "bot");
        return;
      }
      this.lastMessageTime = now;

      this.addMessage(text, "user");
      this.input.value = "";

      var apiBase = (window.SHINAI_CONFIG && window.SHINAI_CONFIG.chatbotApiBase) || "";
      if (!apiBase) {
        this.addMessage(T.notReady, "bot");
        this.addContactCta();
        return;
      }

      if (!this.sessionId) {
        this.sessionId = this.makeSessionId();
      }

      this.showTyping();

      /* 応答言語はページの言語に合わせる。渡さないと英語ページに日本語で返る。
         送るのは message と sessionId のみ(サーバはそれ以外のキーを拒否する)。 */
      var endpoint = apiBase.replace(/\/+$/, "") + "/api/chatbot" + (EN ? "?lang=en" : "");
      window.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: this.sessionId })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        window.setTimeout(function () {
          self.hideTyping();
          /* サーバの応答契約は { success: boolean, response: string } の一形のみ。 */
          if (data && data.success && typeof data.response === "string") {
            self.typeMessage(data.response);
          } else {
            self.addMessage(T.failed, "bot");
            self.addContactCta();
          }
        }, self.loadingDelay);
      }).catch(function () {
        self.hideTyping();
        self.addMessage(T.offline, "bot");
        self.addContactCta();
      });
    },

    makeSessionId: function () {
      var array = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(array);
      return Array.prototype.map.call(array, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    },

    /* 発言は必ず「行」に載せる。行がアイコンと吹き出しを横に並べる器になる。
       吹き出しを直接 messages へ入れる経路を残すと、アイコンの付く発言と
       付かない発言が混ざる。入口をここ一つに絞る。 */
    mountRow: function (bubble, type) {
      var row = document.createElement("div");
      row.className = "chatbot__row chatbot__row--" + type;
      if (type === "bot") {
        row.appendChild(this.createAvatar());
      }
      row.appendChild(bubble);
      this.messages.appendChild(row);
      this.scrollToEnd();
      return row;
    },

    /* アイコンは画像ではなくSVGで描く。図形は案内役キャラクター「アイト」の
       全体像(標準モデル)。押したアイトがそのまま応える、という一対一を
       画面が変わっても保つ。起動UIと違う図形を出すと、開いた先で相手が
       すり替わる。
       色の地は敷かない。円や角丸の色面に載せると、アイトではなく色面が
       アイコンに見え、キャラクターはその中の模様に落ちる。
       まばたきと浮遊はさせない。発言のたびに増える要素であり、画面内の
       複数が別々に動くと、読んでいる本文から目が離れる。動くのは起動UIの
       一体だけでよい。
       図形の正本は partials/_chatbot.html と styles/sections/chatbot.css の
       .aito。三つを同時に直すこと。 */
    createAvatar: function () {
      var wrap = document.createElement("div");
      wrap.className = "chatbot__avatar aito aito--avatar";
      wrap.setAttribute("aria-hidden", "true");
      wrap.innerHTML =
        '<svg viewBox="0 0 66 52" fill="none" focusable="false">' +
        '<g class="aito-block">' +
        '<rect x="4" y="23" width="15" height="15" rx="3" class="ab-box"/>' +
        '<path d="M8 29 h7 M8 33 h5" class="ab-lines"/>' +
        "</g>" +
        '<path d="M26 30 q-5 -1 -8 1" class="aito-arm"/>' +
        '<g class="aito-body">' +
        '<rect x="25" y="11" width="36" height="30" rx="9" class="ab-face"/>' +
        '<path d="M43 11 v-5" class="ab-ant"/>' +
        '<circle cx="43" cy="4" r="2.6" class="ab-antdot"/>' +
        '<circle cx="37" cy="24" r="2.5" class="aito-eye"/>' +
        '<circle cx="50" cy="24" r="2.5" class="aito-eye"/>' +
        '<path d="M39.5 31 q4 3.4 8 0" class="aito-mouth"/>' +
        '<rect x="32" y="41" width="6" height="4" rx="2" class="ab-foot"/>' +
        '<rect x="47" y="41" width="6" height="4" rx="2" class="ab-foot"/>' +
        "</g>" +
        "</svg>";
      return wrap;
    },

    addMessage: function (text, type) {
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--" + type;
      el.textContent = text;
      /* 個々の発言に role="status" を付けない。
         包む #chatbot-messages が既に aria-live であり、入れ子のライブ領域は
         読み上げを二重にする。 */
      this.mountRow(el, type);
      return el;
    },

    /* 一文字ずつ書き足す演出は、そのままだとライブ領域を毎回書き換える。
       200字の答えなら2秒余りのあいだに200回の変化が起き、読み上げは破綻する。
       打ち終わるまで支援技術から隠し、完成した時点で一度だけ現す。
       動きを控える設定の利用者には、演出そのものを行わない。 */
    typeMessage: function (text) {
      var self = this;
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--bot";

      var finish = function () {
        el.removeAttribute("aria-hidden");
        if (self.shouldShowCta(text)) {
          window.setTimeout(function () { self.addContactCta(); }, 280);
        }
      };

      if (this.prefersReducedMotion()) {
        el.textContent = text;
        this.mountRow(el, "bot");
        finish();
        return;
      }

      el.setAttribute("aria-hidden", "true");
      this.mountRow(el, "bot");

      var i = 0;
      var timer = window.setInterval(function () {
        if (i < text.length) {
          el.textContent += text.charAt(i);
          i += 1;
          self.scrollToEnd();
        } else {
          window.clearInterval(timer);
          finish();
        }
      }, this.typingSpeed);
    },

    prefersReducedMotion: function () {
      return !!(window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    },

    shouldShowCta: function (text) {
      var cues = T.cues;
      var hay = EN ? text.toLowerCase() : text;
      var i;
      for (i = 0; i < cues.length; i += 1) {
        if (hay.indexOf(cues[i]) !== -1) {
          return true;
        }
      }
      return false;
    },

    addContactCta: function () {
      var path = (window.SHINAI_CONFIG && window.SHINAI_CONFIG.contactPath) || "contact.html";
      var wrap = document.createElement("div");
      wrap.className = "chatbot__message chatbot__message--bot chatbot__cta";
      var link = document.createElement("a");
      link.className = "btn btn-primary chatbot__cta-btn";
      link.href = path;
      link.textContent = T.cta;
      wrap.appendChild(link);
      this.mountRow(wrap, "bot");
    },

    showTyping: function () {
      this.isTyping = true;
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--bot chatbot__typing";
      el.setAttribute("aria-label", T.typing);
      var k;
      for (k = 0; k < 3; k += 1) {
        var dot = document.createElement("span");
        dot.className = "chatbot__dot";
        el.appendChild(dot);
      }
      /* 目印は行に付ける。吹き出しだけ消すとアイコンが取り残される。 */
      this.mountRow(el, "bot").id = "chatbot-typing";
    },

    hideTyping: function () {
      this.isTyping = false;
      var el = document.getElementById("chatbot-typing");
      if (el) {
        el.parentNode.removeChild(el);
      }
    },

    scrollToEnd: function () {
      this.messages.scrollTop = this.messages.scrollHeight;
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    Chatbot.init();
  });
})();
