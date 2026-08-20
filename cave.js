/* Cave Vines n Glowing Berries — shared cave for every page.
   Drop <script src="cave.js"></script> before </body> on any page in this
   blog and it grows vines + leaves + explosive berries on both sides.
   Self-sufficient: injects its own CSS and creates its own columns/canvas
   if the page doesn't already have them. */
(function () {
  'use strict';

  /* ---------------- self-injected CSS ---------------- */
  function injectCss() {
    if (document.getElementById('cave-css')) return;
    var style = document.createElement('style');
    style.id = 'cave-css';
    style.textContent =
      'html, body { overflow-x: hidden; }' +
      '.vine-column { position: fixed; top: 0; bottom: 0; width: 150px; z-index: 10; pointer-events: none; }' +
      '#vine-left { left: 0; } #vine-right { right: 0; }' +
      '.vine-svg { width: 100%; height: 100%; display: block; }' +
      '.leaf { position: absolute; width: 30px; height: 15px; border-radius: 50%; z-index: 1; }' +
      '.berry { position: absolute; width: 14px; height: 14px; border-radius: 50%;' +
      ' pointer-events: auto; cursor: pointer; z-index: 2;' +
      ' background: radial-gradient(circle at 35% 30%, #ffe98a, #ffc621 55%, #d99a06 100%);' +
      ' box-shadow: 0 0 8px 2px rgba(255,198,33,.5); }' +
      '.berry:hover { filter: brightness(1.2); }' +
      '#confetti { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;' +
      ' z-index: 60; pointer-events: none; }' +
      '@media (max-width: 1120px) { .vine-column { width: 92px; opacity: .45; } }' +
      '@media (max-width: 840px)  { .vine-column { display: none; } }';
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureColumn(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'vine-column';
      document.body.appendChild(el);
    }
    return el;
  }

  function ensureCanvas() {
    var el = document.getElementById('confetti');
    if (!el) {
      el = document.createElement('canvas');
      el.id = 'confetti';
      document.body.appendChild(el);
    }
    return el;
  }

  /* ---------------- state ---------------- */
  var GOLD = ['#ffc621', '#f6c453', '#f2a65a', '#ffe98a', '#e7d053', '#fff3c4'];
  var FAR_COL = [43, 94, 43];      /* deep moss  — far from any glow   */
  var NEAR_COL = [185, 245, 138];  /* bright green — next to a glow    */
  var NEAR = 12, FAR = 40;         /* leaf color falloff radii (px)    */

  var canvas, ctx, dpr, W = 0, H = 0, parts = [], rings = [];
  var berries = [], columns = [], leafDirty = true;

  /* ---------------- confetti ---------------- */
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns.forEach(function (c) {
      var r = c.el.getBoundingClientRect();
      c.w = r.width; c.h = r.height;
    });
  }

  function explode(x, y) {
    rings.push({ x: x, y: y, r: 6, life: 0, max: 26 });
    var n = 72, i, a, sp;
    for (i = 0; i < n; i++) {
      a = Math.random() * Math.PI * 2;
      sp = 2 + Math.random() * 7.5;
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.8,
        g: 0.14, drag: 0.985,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.35,
        size: 2 + Math.random() * 4,
        life: 0, max: 65 + Math.random() * 75,
        color: GOLD[(Math.random() * GOLD.length) | 0],
        rect: Math.random() < 0.5
      });
    }
  }

  function drawConfetti() {
    ctx.clearRect(0, 0, W, H);
    var i, p, r, a;
    for (i = rings.length - 1; i >= 0; i--) {
      r = rings[i]; r.life++; r.r += 2.2;
      a = 1 - r.life / r.max;
      if (a <= 0) { rings.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,198,33,' + (a * 0.9) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.2832); ctx.stroke();
    }
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.spin; p.life++;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      a = 1 - p.life / p.max;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.rect) { ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    }
  }

  /* ---------------- the cave grows itself ---------------- */
  function buildVines(c) {
    c.curves = [];
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'vine-svg');
    svg.setAttribute('viewBox', '0 0 ' + c.w.toFixed(0) + ' ' + c.h.toFixed(0));
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    var STROKES = ['#2b3600', '#243d20', '#2e5220'];
    var v, k;
    for (v = 0; v < 3; v++) {
      (function (v) {
        var amp = 22 + Math.random() * 16;
        var lam = 70 + Math.random() * 50;
        var ph = Math.random() * Math.PI * 2;
        var off = v === 1 ? -8 : (v === 2 ? 10 : 0);
        var curve = {
          amp: amp, lam: lam, ph: ph, off: off,
          x: function (y) {
            return c.w / 2 + off + amp * Math.sin(y / lam + ph) + 7 * Math.sin(y / 47 + ph * 2.3);
          }
        };
        c.curves.push(curve);
        var d = '', y, pts = [];
        for (k = 0; k <= 80; k++) {
          y = c.h * k / 80;
          pts.push({ x: curve.x(y), y: y });
          d += (k ? ' L' : 'M') + pts[k].x.toFixed(1) + ' ' + y.toFixed(1);
        }
        curve.pts = pts;   /* single source of truth: path + berries share these points */
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', STROKES[v]);
        p.setAttribute('stroke-width', v === 0 ? 5 : 4);
        p.setAttribute('opacity', '0.92');
        svg.appendChild(p);
      })(v);
    }
    c.el.appendChild(svg);
  }

  function plantLeaves(c) {
    var step = c.h / 44;                       /* even vertical spacing */
    var y = step * (0.5 + Math.random() * 0.4);
    var i = 0;
    while (y < c.h - 24) {
      var cur = c.curves[i % c.curves.length];
      var x = cur.x(y);
      var side = (i % 2 === 0) ? 1 : -1;       /* alternate sides of the vine */
      var lx = x + side * (12 + Math.random() * 14);
      var ly = y + 3 + Math.random() * 6;      /* hangs just below the vine */
      var el = document.createElement('div');
      el.className = 'leaf';
      el.style.left = Math.max(0.5, Math.min(99.5, lx / c.w * 100)).toFixed(1) + '%';
      el.style.top = Math.max(0.5, Math.min(99.5, ly / c.h * 100)).toFixed(1) + '%';
      el.style.transform = 'rotate(' + (90 + Math.random() * 24 - 12).toFixed(1) + 'deg) scale(' +
                           (1.85 + Math.random() * 0.5).toFixed(2) + ')';  /* hanging, slightly tilted, even sizes */
      el.style.opacity = (0.55 + Math.random() * 0.2).toFixed(2);          /* semitransparent */
      el.style.background = 'rgb(43,94,43)';   /* starter; recolored each frame by glow distance */
      c.el.appendChild(el);
      c.leaves.push({ el: el, x: lx / c.w, y: ly / c.h });
      y += step * (0.9 + Math.random() * 0.25);  /* mostly-even spacing, small jitter */
      i++;
    }
  }

  function makeBerry(c, fx, fy) {
    var el = document.createElement('div');
    el.className = 'berry';
    el.style.left = (fx * 100).toFixed(1) + '%';
    el.style.top = (fy * 100).toFixed(1) + '%';
    el.style.opacity = '1';
    c.el.appendChild(el);
    var berry = { el: el, c: c, fx: fx, fy: fy, state: 'idle', chargeStart: 0, chargeDur: 0, lastBr: -1 };
    c.berries.push(berry);
    berries.push(berry);
    el.addEventListener('click', function (e) { clickBerry(berry, e); });
    return berry;
  }

  function plantBerries(c) {
    /* berries grow ON the main vine — placed at points sampled from its own path */
    var pts = c.curves[0].pts;
    var n = 8, i, pt;
    var start = 1 + ((Math.random() * 8) | 0);
    var step = Math.max(1, ((pts.length - 2) / (n + 1)) | 0);
    for (i = 0; i < n; i++) {
      pt = pts[start + i * step];
      makeBerry(c, pt.x / c.w, pt.y / c.h);
    }
  }

  function setBerry(b, br) {                   /* brightness 0..1 */
    if (b.lastBr === br) return;
    b.lastBr = br;
    b.el.style.opacity = br.toFixed(3);
    b.el.style.transform = 'scale(' + (0.85 + 0.35 * br).toFixed(3) + ')';
    b.el.style.boxShadow = '0 0 ' + (6 + 14 * br).toFixed(1) + 'px ' + (1 + 4 * br).toFixed(1) +
                           'px rgba(255,198,33,' + (0.35 + 0.55 * br).toFixed(3) + ')';
  }

  function isGlowing(b, now) {
    if (b.state === 'dead') return false;      /* transient absence after explosion */
    if (b.state === 'idle') return true;
    var ph = ((now - b.chargeStart) / b.chargeDur) % 2;   /* charging: alternates bright/dark */
    var br = ph < 1 ? 0.12 + 0.88 * ph : 1.0 - 0.88 * (ph - 1);
    return br > 0.5;                           /* darkness during blink doesn't glow */
  }

  function mix(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
           Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
           Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function colorLeaves(now) {
    var ci, li, gi, L, G, dmin, dx, dy, d, t, col;
    for (ci = 0; ci < columns.length; ci++) {
      var c = columns[ci];
      var glows = [];
      for (gi = 0; gi < c.berries.length; gi++) {
        if (isGlowing(c.berries[gi], now)) glows.push(c.berries[gi]);
      }
      G = glows.length; L = c.leaves.length;
      for (li = 0; li < L; li++) {
        var lf = c.leaves[li];
        dmin = 1e9;
        for (gi = 0; gi < G; gi++) {
          dx = (lf.x - glows[gi].fx) * c.w;
          dy = (lf.y - glows[gi].fy) * c.h;
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < dmin) dmin = d;
        }
        t = dmin >= FAR ? 0 : (dmin <= NEAR ? 1 : 1 - (dmin - NEAR) / (FAR - NEAR));
        col = mix(FAR_COL, NEAR_COL, t);
        if (lf.el.style.background !== col) lf.el.style.background = col;
      }
    }
  }

  /* ---------------- berry behaviour ---------------- */
  function clickBerry(b, e) {
    if (b.state !== 'idle') return;
    b.state = 'charging';
    b.chargeStart = performance.now();
    b.chargeDur = 620;
    leafDirty = true;
    var iv = setInterval(function () {
      if (b.state !== 'charging') { clearInterval(iv); return; }
      b.chargeDur *= 0.68;                     /* blink faster and faster */
      if (b.chargeDur < 45) {
        clearInterval(iv);                     /* …then bloom */
        boomBerry(b, e.clientX, e.clientY);
      }
    }, 150);
  }

  function boomBerry(b, cx, cy) {
    explode(cx, cy);
    b.state = 'dead';
    b.lastBr = -1;
    b.el.style.opacity = '0';
    b.el.style.boxShadow = 'none';
    leafDirty = true;
    setTimeout(function () {                   /* a fresh berry grows back — on the vine, reusable */
      var c = b.c, i;
      i = c.berries.indexOf(b); if (i >= 0) c.berries.splice(i, 1);
      i = berries.indexOf(b); if (i >= 0) berries.splice(i, 1);
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
      var pts = c.curves[0].pts;               /* regrown berries also grow ON the vine */
      var pt = pts[(Math.random() * pts.length) | 0];
      makeBerry(c, pt.x / c.w, pt.y / c.h);
      leafDirty = true;
    }, 2600);
  }

  /* ---------------- main loop ---------------- */
  function frame(now) {
    var anyCharging = false, i, b, br, ph;
    for (i = 0; i < berries.length; i++) {
      b = berries[i];
      if (b.state === 'idle') { setBerry(b, 1); continue; }
      if (b.state === 'dead') continue;
      anyCharging = true;
      ph = ((now - b.chargeStart) / b.chargeDur) % 2;
      br = ph < 1 ? 0.12 + 0.88 * ph : 1.0 - 0.88 * (ph - 1);
      setBerry(b, br);
    }
    if (leafDirty || anyCharging) {
      colorLeaves(now);
      if (!anyCharging) leafDirty = false;
    }
    drawConfetti();
    requestAnimationFrame(frame);
  }

  /* ---------------- grow the cave on this page ---------------- */
  function init() {
    injectCss();
    canvas = ensureCanvas();
    ctx = canvas.getContext('2d');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    window.addEventListener('resize', resize);

    ['vine-left', 'vine-right'].forEach(function (id) {
      var c = { el: ensureColumn(id), berries: [], leaves: [], curves: [], w: 150, h: 900 };
      columns.push(c);
      buildVines(c);
      plantLeaves(c);
      plantBerries(c);
    });
    resize();
    requestAnimationFrame(frame);

    window.__grown = {  /* test probe */
      leaves: columns[0].leaves.length + columns[1].leaves.length,
      berries: berries.length,
      onVine: berries.every(function (b) {
        var c = b.c, pts = c.curves[0].pts, i;
        for (i = 0; i < pts.length; i++) {
          if (Math.abs(pts[i].x / c.w - b.fx) < 1e-9 && Math.abs(pts[i].y / c.h - b.fy) < 1e-9) return true;
        }
        return false;
      })
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
