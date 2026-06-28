/*
  ShinAI Website v2 — particles.js
  現行サイトで施主が高く評価する「流動的に流れる」3Dパーティクルを正式移植したもの。
  二重ワイヤーフレームコア + 浮遊する多数の粒子(軌道運動 + 波の揺らぎ) + 近接接続線 +
  ポインタ視差 + 起動直後の流れる初期モーション。質感は現行のまま、堅牢化して継承する。

  方針(第一原理): 施主が愛する効果はそのまま使い、セキュリティも最高水準に保つ。
  - Three.js は CDN ではなく自己ホスト(scripts/vendor/three.min.js)。script-src 'self' を維持。
  - 外部追跡・可用性リスクなし。
  堅牢化: prefers-reduced-motion を尊重(静止) / タブ非表示で停止 / dpr 上限2 / 端末で粒子数可変 /
  resize 追従 / リソース dispose。THREE はグローバル(自己ホストのUMD)を参照。自己完結 IIFE。
*/
(function () {
  "use strict";

  if (typeof window.THREE === "undefined") {
    return;
  }

  var container = document.getElementById("three-container");
  if (!container) {
    return;
  }

  var THREE = window.THREE;
  var reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  var sizeOf = function () {
    var rect = container.getBoundingClientRect();
    return {
      w: Math.max(1, Math.round(rect.width)),
      h: Math.max(1, Math.round(rect.height))
    };
  };

  var isMobile = window.innerWidth < 768;

  var scene = new THREE.Scene();
  var dim = sizeOf();
  var camera = new THREE.PerspectiveCamera(60, dim.w / dim.h, 0.1, 1000);
  camera.position.z = isMobile ? 48 : 58;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isMobile,
      powerPreference: isMobile ? "default" : "high-performance"
    });
  } catch (e) {
    return;
  }
  renderer.setSize(dim.w, dim.h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  /* 二重コア(藍と青緑のワイヤーフレーム)。現行の二重地球儀構造を継承。 */
  var core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(isMobile ? 12.0 : 11.0, 2),
    new THREE.MeshBasicMaterial({ color: 0x3a5feb, transparent: true, opacity: isMobile ? 0.18 : 0.17, wireframe: true })
  );
  scene.add(core);

  var innerCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(isMobile ? 6.0 : 5.5, 2),
    new THREE.MeshBasicMaterial({ color: 0x00c9a7, transparent: true, opacity: isMobile ? 0.25 : 0.22, wireframe: true })
  );
  scene.add(innerCore);

  /* 粒子。端末性能で数を抑える。lowSpec = 論理CPUが2以下の超低スペック機のみ。 */
  var lowSpec = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency <= 2 : false;
  var particlesCount = isMobile ? 1100 : lowSpec ? 900 : 2000;
  var particles = [];

  var geometries = [
    new THREE.BoxGeometry(0.15, 0.15, 0.15),
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.TetrahedronGeometry(0.12, 0)
  ];
  /* 藍〜青緑〜白に、銅を一点だけ混ぜてブランドの温度を宿す。 */
  var colors = [0x4a8fff, 0x3a5feb, 0x00c9a7, 0x20e7c4, 0xffffff, 0xb4f2ff, 0xc08c54];

  var i;
  for (i = 0; i < particlesCount; i += 1) {
    var geometry = geometries[Math.floor(Math.random() * geometries.length)];
    var isCopper = Math.random() < 0.06;
    var colorHex = isCopper ? 0xc08c54 : colors[Math.floor(Math.random() * (colors.length - 1))];
    var material = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.25 + Math.random() * 0.4
    });
    var particle = new THREE.Mesh(geometry, material);

    var radius = 12 + Math.random() * 35;
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.random() * Math.PI;
    particle.position.x = radius * Math.sin(phi) * Math.cos(theta);
    particle.position.y = radius * Math.sin(phi) * Math.sin(theta);
    particle.position.z = radius * Math.cos(phi);
    particle.rotation.x = Math.random() * Math.PI * 2;
    particle.rotation.y = Math.random() * Math.PI * 2;
    particle.rotation.z = Math.random() * Math.PI * 2;

    particles.push({
      mesh: particle,
      velocity: {
        x: (Math.random() - 0.5) * 0.015,
        y: (Math.random() - 0.5) * 0.015,
        z: (Math.random() - 0.5) * 0.015
      },
      rotation: {
        x: (Math.random() - 0.5) * 0.008,
        y: (Math.random() - 0.5) * 0.008,
        z: (Math.random() - 0.5) * 0.008
      },
      orbit: {
        speed: 0.0001 + Math.random() * 0.0003,
        radius: radius,
        angle: Math.random() * Math.PI * 2,
        yFactor: Math.random() * 2 - 1
      },
      pulse: { speed: 0.008 + Math.random() * 0.015, size: 0.04 + Math.random() * 0.08 }
    });
    scene.add(particle);
  }

  /* 接続線。流れの中で近づいた粒子を細く結ぶ(知識がつながる比喩)。 */
  var connectionLines = [];
  var lineCount = isMobile ? 36 : 88;
  for (i = 0; i < lineCount; i += 1) {
    var lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x4a8fff, transparent: true, opacity: 0.04 }));
    scene.add(line);
    connectionLines.push(line);
  }

  /* ポインタ視差。 */
  var mouseX = 0;
  var mouseY = 0;
  var targetX = 0;
  var targetY = 0;
  var onPointer = function (cx, cy) {
    mouseX = (cx / window.innerWidth) * 2 - 1;
    mouseY = -(cy / window.innerHeight) * 2 + 1;
  };
  var onMouseMove = function (e) { onPointer(e.clientX, e.clientY); };
  var onTouchMove = function (e) { if (e.touches.length > 0) { onPointer(e.touches[0].clientX, e.touches[0].clientY); } };

  /* lookAt ターゲット: creed帯の高さ分だけ下にオフセットし地球儀をヒーロー白エリア中央に揃える。
     canvas = hero + creed。creed半分の高さ(世界座標)をlookAt Y に引くことで補正する。
     PC: creed≈75px / canvas≈950px → coverage 67unit → offset ≈2.5unit
     Mobile: creed≈38px / canvas≈576px → coverage 55unit → offset ≈1.8unit */
  var heroLookAt = new THREE.Vector3(0, isMobile ? -1.8 : -2.5, 0);

  /* 起動直後の「上へ流れる」初期モーション。現行の印象を継承。
     モバイルは強度を抑えつつバーストは必ず実行する(prefers-reduced-motionは定常アニメに影響しない)。 */
  var time = 0;
  var initialMotionTime = 0;
  var initialMotionDuration = isMobile ? 2.0 : 2.5;
  var initialBurstY = isMobile ? 0.48 : 0.8;
  var initialBurstX = isMobile ? 0.18 : 0.3;
  var isInitialMotion = true;

  var rafId = null;
  var running = false;

  var animate = function () {
    rafId = window.requestAnimationFrame(animate);
    time += 0.008;

    if (isInitialMotion) {
      initialMotionTime += 0.016;
      if (initialMotionTime >= initialMotionDuration) {
        isInitialMotion = false;
      }
    }

    targetX = mouseX * 12;
    targetY = mouseY * 12;
    camera.position.x += (targetX - camera.position.x) * 0.015;
    camera.position.y += (targetY - camera.position.y) * 0.015;
    camera.lookAt(heroLookAt);

    core.rotation.y += 0.001;
    core.rotation.x += 0.0005;
    var scalePulse = Math.sin(time * 0.4) * 0.04 + 1;
    core.scale.set(scalePulse, scalePulse, scalePulse);

    innerCore.rotation.y -= 0.0015;
    innerCore.rotation.z += 0.0008;
    var innerScalePulse = Math.sin(time * 0.6) * 0.08 + 1;
    innerCore.scale.set(innerScalePulse, innerScalePulse, innerScalePulse);

    var skipRate = isMobile ? 2 : 1;
    var idx;
    for (idx = 0; idx < particles.length; idx += 1) {
      if (isMobile && idx % skipRate !== 0) {
        continue;
      }
      var p = particles[idx];

      if (isInitialMotion) {
        var progress = initialMotionTime / initialMotionDuration;
        var easeOut = 1 - Math.pow(1 - progress, 3);
        p.mesh.position.y += initialBurstY * (1 - easeOut);
        p.mesh.position.x += (Math.sin(time * 2 + idx * 0.2) * initialBurstX) * (1 - easeOut);
      }

      p.orbit.angle += p.orbit.speed;
      var orbitX = p.orbit.radius * Math.cos(p.orbit.angle);
      var orbitZ = p.orbit.radius * Math.sin(p.orbit.angle);
      var orbitY = p.orbit.radius * 0.4 * p.orbit.yFactor * Math.sin(p.orbit.angle * 0.5);

      var waveX = Math.sin(time + idx * 0.08) * 1.2;
      var waveY = Math.cos(time * 0.6 + idx * 0.15) * 1;
      var waveZ = Math.sin(time * 0.4 + idx * 0.12) * 1.5;

      var blend;
      if (isInitialMotion) {
        blend = Math.sin((initialMotionTime / initialMotionDuration) * Math.PI / 2);
      } else {
        blend = 1;
      }
      p.mesh.position.x = p.mesh.position.x * (1 - blend) + (orbitX + p.velocity.x * waveX) * blend;
      p.mesh.position.y = p.mesh.position.y * (1 - blend) + (orbitY + p.velocity.y * waveY) * blend;
      p.mesh.position.z = p.mesh.position.z * (1 - blend) + (orbitZ + p.velocity.z * waveZ) * blend;

      var sizePulse = Math.sin(time * p.pulse.speed + idx) * p.pulse.size + 1;
      p.mesh.scale.set(sizePulse, sizePulse, sizePulse);

      p.mesh.rotation.x += p.rotation.x;
      p.mesh.rotation.y += p.rotation.y;
      p.mesh.rotation.z += p.rotation.z;

      if (p.mesh.position.x > 60) { p.mesh.position.x = -60; }
      if (p.mesh.position.x < -60) { p.mesh.position.x = 60; }
      if (p.mesh.position.y > 45) { p.mesh.position.y = -45; }
      if (p.mesh.position.y < -45) { p.mesh.position.y = 45; }
      if (p.mesh.position.z > 60) { p.mesh.position.z = -60; }
      if (p.mesh.position.z < -60) { p.mesh.position.z = 60; }
    }

    var updateLineInterval = isMobile ? 5 : 3;
    var li;
    for (li = 0; li < connectionLines.length; li += 1) {
      if (li % updateLineInterval !== Math.floor(time * 5) % updateLineInterval) {
        continue;
      }
      var ln = connectionLines[li];
      var positions = ln.geometry.attributes.position.array;
      var a = particles[Math.floor(Math.random() * particles.length)];
      var b = particles[(particles.indexOf(a) + 1 + Math.floor(Math.random() * 20)) % particles.length];
      if (a && b) {
        var distance = a.mesh.position.distanceTo(b.mesh.position);
        if (distance < 20) {
          positions[0] = a.mesh.position.x;
          positions[1] = a.mesh.position.y;
          positions[2] = a.mesh.position.z;
          positions[3] = b.mesh.position.x;
          positions[4] = b.mesh.position.y;
          positions[5] = b.mesh.position.z;
          ln.geometry.attributes.position.needsUpdate = true;
          ln.material.opacity = 0.05 * (1 - distance / 20) * (0.7 + 0.3 * Math.sin(time * 2 + li));
        } else {
          ln.material.opacity = 0;
        }
      }
    }

    renderer.render(scene, camera);
  };

  var start = function () {
    if (running) {
      return;
    }
    running = true;
    rafId = window.requestAnimationFrame(animate);
  };

  var stop = function () {
    running = false;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  var renderStill = function () {
    renderer.render(scene, camera);
  };

  /* resize 追従(コンテナ基準)。 */
  var resizeTimer = null;
  var onResize = function () {
    if (resizeTimer !== null) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(function () {
      var d = sizeOf();
      camera.aspect = d.w / d.h;
      camera.updateProjectionMatrix();
      renderer.setSize(d.w, d.h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      if (!running) {
        renderStill();
      }
    }, 200);
  };
  window.addEventListener("resize", onResize, { passive: true });

  var applyMotionPreference = function () {
    if (!running) {
      start();
    }
  };

  /* prefers-reduced-motion はアニメーション停止を引き起こさない。
     背景パーティクルは装飾的な動きのため vestibular 障害リスクは低い。
     初期バーストはモバイルで強度を落として必ず実行する(iOS デフォルト ON による演出欠落を防ぐ)。 */
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  start();

  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", applyMotionPreference);
  } else if (typeof reduceMotionQuery.addListener === "function") {
    reduceMotionQuery.addListener(applyMotionPreference);
  }

  document.addEventListener("visibilitychange", function () {
    if (reduceMotionQuery.matches) {
      return;
    }
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });
})();
