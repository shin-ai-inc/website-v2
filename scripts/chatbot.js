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
      this.addMessage(
        "こんにちは。ShinAI のアシスタントです。暗黙知のAI化や、業務への適用について、気軽にお尋ねください。",
        "bot"
      );
    },

    toggle: function () {
      var willOpen = !this.panel.classList.contains("is-open");
      this.panel.classList.toggle("is-open", willOpen);
      this.button.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen && window.innerWidth > 768) {
        this.input.focus();
      }
    },

    close: function () {
      this.panel.classList.remove("is-open");
      this.button.setAttribute("aria-expanded", "false");
    },

    /* クライアント側の多層チェック(防御の一層)。 */
    validate: function (text) {
      if (text.length > 500) {
        return "メッセージが長すぎます。500文字以内でお願いします。";
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
          return "申し訳ありません。その内容には回答できません。具体的なご相談はお問い合わせフォームをご利用ください。";
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
        this.addMessage("送信が続いています。少しだけお待ちください。", "bot");
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
        this.addMessage(
          "ただいまAIアシスタントは準備中です。お問い合わせフォームよりご連絡いただければ、担当より折り返します。",
          "bot"
        );
        this.addContactCta();
        return;
      }

      if (!this.sessionId) {
        this.sessionId = this.makeSessionId();
      }

      this.showTyping();

      window.fetch(apiBase.replace(/\/+$/, "") + "/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: this.sessionId })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        window.setTimeout(function () {
          self.hideTyping();
          if (data && data.success) {
            var responseText = typeof data.response === "string"
              ? data.response
              : (data.response && data.response.response) || "";
            self.typeMessage(String(responseText));
          } else {
            self.addMessage("申し訳ありません。一時的に応答できませんでした。お問い合わせフォームをご利用ください。", "bot");
            self.addContactCta();
          }
        }, self.loadingDelay);
      }).catch(function () {
        self.hideTyping();
        self.addMessage("サーバーに接続できませんでした。通信環境をご確認のうえ、お問い合わせフォームよりご連絡ください。", "bot");
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

    addMessage: function (text, type) {
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--" + type;
      el.textContent = text;
      if (type === "bot") {
        el.setAttribute("role", "status");
      }
      this.messages.appendChild(el);
      this.scrollToEnd();
      return el;
    },

    typeMessage: function (text) {
      var self = this;
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--bot";
      el.setAttribute("role", "status");
      this.messages.appendChild(el);

      var i = 0;
      var timer = window.setInterval(function () {
        if (i < text.length) {
          el.textContent += text.charAt(i);
          i += 1;
          self.scrollToEnd();
        } else {
          window.clearInterval(timer);
          if (self.shouldShowCta(text)) {
            window.setTimeout(function () { self.addContactCta(); }, 280);
          }
        }
      }, this.typingSpeed);
    },

    shouldShowCta: function (text) {
      var cues = [
        "お問い合わせ", "無料相談", "ご相談ください", "導入", "御社", "貴社",
        "料金", "費用", "期間", "詳しく", "具体的", "ご提案"
      ];
      var i;
      for (i = 0; i < cues.length; i += 1) {
        if (text.indexOf(cues[i]) !== -1) {
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
      link.textContent = "お問い合わせ・無料相談へ";
      wrap.appendChild(link);
      this.messages.appendChild(wrap);
      this.scrollToEnd();
    },

    showTyping: function () {
      this.isTyping = true;
      var el = document.createElement("div");
      el.className = "chatbot__message chatbot__message--bot chatbot__typing";
      el.id = "chatbot-typing";
      el.setAttribute("aria-label", "入力中");
      var k;
      for (k = 0; k < 3; k += 1) {
        var dot = document.createElement("span");
        dot.className = "chatbot__dot";
        el.appendChild(dot);
      }
      this.messages.appendChild(el);
      this.scrollToEnd();
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
