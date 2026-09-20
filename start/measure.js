(function (w, d) {
  "use strict";

  var PIXEL_ID = "1060030986770128";
  if (w.fbq) return;

  try {
    var fbq = w.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    if (!w._fbq) w._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];

    fbq("set", "autoConfig", false, PIXEL_ID);
    fbq("init", PIXEL_ID);
    fbq("track", "PageView");

    var tag = d.createElement("script");
    tag.async = true;
    tag.src = "https://connect.facebook.net/en_US/fbevents.js";
    var first = d.getElementsByTagName("script")[0];
    first.parentNode.insertBefore(tag, first);
  } catch (err) {}
})(window, document);
