/* md.js — tiny Markdown → HTML parser, no dependencies.
   Renders into a container on the page; content lives in .md files.
   Exports: mdToHtml(md) -> html string, loadMd(url[, containerId]).
   Block support: headings, paragraphs, fenced code (code-window chrome),
   blockquotes + [!ok]/[!warn] callouts, ul/ol with nesting + task items,
   GFM tables, hr. Inline: `code`, **bold**, *italic*, ~~strike~~,
   [links](url), ![images](src). All text is HTML-escaped first. */
(function (global) {
  'use strict';

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- inline: escape first, then apply spans ---- */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }

  /* heading id: slugified (keeps CJK), deduped per render */
  function slug(s) {
    s = s.replace(/<[^>]+>/g, '').toLowerCase()
         .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
         .replace(/^-+|-+$/g, '').slice(0, 48);
    return s || 'sec';
  }

  function codeBlock(lang, code) {
    var label = lang ? esc(lang) : 'code';
    return '<div class="code-window"><div class="code-head"><span class="dots">● ● ●</span> ' +
           label + '<span class="fname">code</span></div><pre><code>' + esc(code) +
           '</code></pre></div>';
  }

  /* ---- nested lists ---- */
  function parseList(lines, i, indent) {
    var html = [], ord = false, first, m;
    first = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    ord = /^\d+\./.test(first[2]);
    while (i < lines.length) {
      m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (!m) break;
      if (m[1].length < indent || m[1].length > indent) break;
      var task = m[3].match(/^\[( |x|X)\]\s+(.*)$/);
      var liCls = '', text = m[3];
      if (task) { liCls = task[1] === ' ' ? ' class="task"' : ' class="task done"'; text = task[2]; }
      i++;
      var inner = '';
      if (i < lines.length) {
        var nm = lines[i].match(/^(\s*)([-*]|\d+\.)\s+\S/);
        if (nm && nm[1].length > indent) {
          var sub = parseList(lines, i, nm[1].length);
          inner = sub.html;
          i = sub.i;
        }
      }
      html.push('<li' + liCls + '>' + inline(text) + inner + '</li>');
    }
    return { html: '<' + (ord ? 'ol' : 'ul') + '>' + html.join('') + '</' + (ord ? 'ol' : 'ul') + '>', i: i };
  }

  /* ---- GFM table ---- */
  function parseTable(lines, i) {
    var cells = function (l) {
      return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    };
    var head = cells(lines[i]);
    var sep = lines[i + 1];
    if (!sep || !/^\s*\|?[\s:|-]+\|?\s*$/.test(sep)) return null;
    i += 2;
    var rows = [];
    while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
      rows.push(cells(lines[i]));
      i++;
    }
    var h = '';
    for (var c = 0; c < head.length; c++) h += '<th>' + inline(head[c]) + '</th>';
    var b = '';
    for (var r = 0; r < rows.length; r++) {
      var tds = '';
      for (c = 0; c < head.length; c++) tds += '<td>' + inline(rows[r][c] || '') + '</td>';
      b += '<tr>' + tds + '</tr>';
    }
    return { html: '<table><thead><tr>' + h + '</tr></thead><tbody>' + b + '</tbody></table>', i: i };
  }

  /* ---- main ---- */
  function mdToHtml(md) {
    var lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    var out = [], i = 0, n = lines.length, usedIds = {};

    while (i < n) {
      var line = lines[i];

      if (!line.trim()) { i++; continue; }

      /* fenced code */
      var fm = line.match(/^```\s*(.*?)\s*$/);
      if (fm) {
        var buf = [], lang = fm[1];
        i++;
        while (i < n && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(codeBlock(lang, buf.join('\n')));
        continue;
      }

      /* heading */
      var hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        var lvl = hm[1].length;
        var id = slug(hm[2]);
        if (usedIds[id]) {
          var k = 2;
          while (usedIds[id + '-' + k]) k++;
          id = id + '-' + k;
        }
        usedIds[id] = true;
        out.push('<h' + lvl + ' id="' + id + '">' + inline(hm[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }

      /* horizontal rule */
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      /* blockquote (+ [!ok]/[!warn] callouts) */
      if (line.charAt(0) === '>') {
        var q = [], cls = '';
        while (i < n && lines[i].charAt(0) === '>') {
          var ql = lines[i].replace(/^>\s?/, '');
          var cm = ql.match(/^\[!(ok|warn)\]\s*(.*)$/);
          if (cm) { cls = cm[1]; ql = cm[2]; }
          q.push(ql);
          i++;
        }
        out.push('<blockquote' + (cls ? ' class="note ' + cls + '"' : '') + '><p>' +
                 inline(q.join(' ')) + '</p></blockquote>');
        continue;
      }

      /* table */
      if (line.indexOf('|') >= 0) {
        var tb = parseTable(lines, i);
        if (tb) { out.push(tb.html); i = tb.i; continue; }
      }

      /* lists */
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        var ls = parseList(lines, i, line.match(/^(\s*)/)[1].length);
        out.push(ls.html);
        i = ls.i;
        continue;
      }

      /* paragraph */
      var para = [line];
      i++;
      while (i < n && lines[i].trim() &&
             !/^(#{1,6})\s/.test(lines[i]) && lines[i].charAt(0) !== '>' &&
             !/^```/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
             lines[i].indexOf('|') < 0 && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  /* ---- print/download widget (auto-injected, idempotent) ---- */
  var currentMd = null, currentRaw = '';

  function ensureWidget() {
    if (document.getElementById('md-widget')) return;
    var css = document.createElement('style');
    css.id = 'md-widget-css';
    css.textContent =
      '.print-widget { position: fixed; right: 14px; bottom: 14px; z-index: 40;' +
      ' display: flex; gap: 6px; background: var(--bg-panel);' +
      ' border: 1px solid var(--code-border); border-radius: 999px; padding: 5px 8px;' +
      ' box-shadow: 0 6px 18px rgba(0,0,0,.5); }' +
      '.print-widget button { border: 1px solid var(--code-border); background: transparent;' +
      ' color: var(--text); font-size: 15px; line-height: 1; padding: 5px 7px;' +
      ' border-radius: 50%; cursor: pointer; }' +
      '.print-widget button:hover { background: var(--user-bg); color: var(--user-text);' +
      ' border-color: var(--border); }' +
      '@media print {' +
      ' .print-widget, .vine-column, #confetti, .channels, footer { display: none !important; }' +
      ' html, body { background: #fff !important; } body { color: #000 !important; }' +
      ' .page { max-width: none !important; padding: 0 !important; }' +
      ' h1, h2, h3, h4, h5, h6 { color: #000 !important; }' +
      ' h1 { background: none !important; border: none !important; box-shadow: none !important;' +
      ' text-align: left !important; padding: 0 !important; }' +
      ' h2::before, h3::before, h4::before, h5::before, h6::before { content: none !important; }' +
      ' a { color: #000 !important; }' +
      ' blockquote { color: #000 !important; border-left-color: #999 !important;' +
      ' background: none !important; }' +
      ' code, pre { color: #000 !important; background: #f4f4f4 !important;' +
      ' border-color: #ccc !important; }' +
      ' .code-window { border-color: #ccc !important; background: #fff !important; }' +
      ' .code-head { background: #eee !important; color: #000 !important; }' +
      ' table { color: #000 !important; } th { background: #eee !important; color: #000 !important; }' +
      ' td, th { border-color: #999 !important; }' +
      '} ';
    (document.head || document.documentElement).appendChild(css);

    var w = document.createElement('div');
    w.id = 'md-widget';
    w.className = 'print-widget';
    w.innerHTML = '<button data-act="print" title="Print / Save as PDF">🖨</button>' +
                  '<button data-act="dl" title="Download this page (.md)">⬇</button>';
    (document.body || document.documentElement).appendChild(w);
    w.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.getAttribute('data-act') === 'print') {
        if (window.print) window.print();
      } else {
        downloadCurrentMd();
      }
    });
  }

  function downloadCurrentMd() {
    if (!currentMd) return;
    var blob = new Blob([currentRaw], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = currentMd.split('/').pop();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---- load a .md file into a page container ---- */
  /* .md links inside rendered content become page jumps, not navigation */
  function bindMdLinks(cont) {
    var links = cont.querySelectorAll('a');
    Array.prototype.forEach.call(links, function (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') return;            /* plain anchors: native scroll */
      if (!/\.md($|[?#])/.test(href)) return;        /* non-md links: normal navigation */
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = href.split(/[?#]/)[0];
        var hash = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#')) : '';
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        if (hash) location.hash = hash.slice(1);     /* loadMd scrolls to it after render */
        loadMd(target);
      });
    });
  }

  function loadMd(url, containerId) {
    var cont = document.getElementById(containerId || 'md-content');
    if (!cont) return;
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      currentMd = url;
      currentRaw = t;
      cont.innerHTML = mdToHtml(t);
      bindMdLinks(cont);
      ensureWidget();
      var h = location.hash && location.hash.slice(1);
      if (h) {
        var el = document.getElementById(h);
        if (el) el.scrollIntoView();
      }
    }).catch(function (e) {
      cont.innerHTML = '<p class="note warn">✗ could not load <code>' + esc(url) + '</code> (' +
                       esc(e.message) + '). Serve this folder over HTTP, e.g. ' +
                       '<code>python3 -m http.server</code>.</p>';
    });
  }

  global.mdToHtml = mdToHtml;
  global.loadMd = loadMd;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mdToHtml: mdToHtml, loadMd: loadMd };
  }
})(typeof window !== 'undefined' ? window : globalThis);
