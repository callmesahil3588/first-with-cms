/* AUTO-GENERATED from the same source as the copy inside /api/cms.js.
   Keep the two identical so preview matches what gets published. */
/* ---------------------------------------------------------------
   mdToHtml — small, safe Markdown renderer.

   Everything is HTML-escaped FIRST, so nothing a writer pastes can
   ever become live markup. Only the tags produced below can appear.

   Supports: ## / ### headings, **bold**, *italic*, `code`,
   [links](url), ![images](url), - bullets, 1. numbers, > quotes,
   --- dividers, ``` code blocks, | tables |.
   --------------------------------------------------------------- */
function mdToHtml(src) {
  var esc = function (s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  var inline = function (s) {
    var stash = [];
    // pull code spans out first so their contents are left alone
    s = s.replace(/`([^`]+)`/g, function (m, code) {
      stash.push('<code>' + code + '</code>');
      return '\u0000' + (stash.length - 1) + '\u0000';
    });
    // images before links (same bracket shape)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      return /^(https?:|\/)/.test(url) ? '<img src="' + url + '" alt="' + alt + '" loading="lazy" />' : alt;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
      if (!/^(https?:|\/|mailto:|#)/.test(url)) return text;
      var ext = /^https?:/.test(url);
      return '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + text + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return stash[Number(i)]; });
  };

  var lines = esc(src).replace(/\r\n?/g, '\n').split('\n');
  var out = [];
  var i = 0;

  var closeList = function (stack) {
    while (stack.length) out.push('</' + stack.pop() + '>');
  };
  var listStack = [];

  while (i < lines.length) {
    var line = lines[i];

    // fenced code block
    if (/^```/.test(line.trim())) {
      closeList(listStack);
      var buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + buf.join('\n') + '</code></pre>');
      continue;
    }

    // table
    if (/^\|/.test(line.trim()) && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      closeList(listStack);
      var cells = function (row) {
        return row.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return inline(c.trim()); });
      };
      var head = cells(line);
      i += 2;
      var body = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) { body.push(cells(lines[i])); i++; }
      out.push(
        '<table><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
        body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table>'
      );
      continue;
    }

    // headings
    var h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList(listStack);
      var lvl = h[1].length;
      out.push('<h' + lvl + '>' + inline(h[2].trim()) + '</h' + lvl + '>');
      i++;
      continue;
    }

    // divider
    if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
      closeList(listStack);
      out.push('<hr />');
      i++;
      continue;
    }

    // blockquote
    if (/^&gt;\s?/.test(line)) {
      closeList(listStack);
      var q = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) { q.push(lines[i].replace(/^&gt;\s?/, '')); i++; }
      out.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>');
      continue;
    }

    // lists
    var ul = /^[-*+]\s+(.*)$/.exec(line);
    var ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      var want = ul ? 'ul' : 'ol';
      if (listStack[listStack.length - 1] !== want) { closeList(listStack); out.push('<' + want + '>'); listStack.push(want); }
      out.push('<li>' + inline((ul || ol)[1].trim()) + '</li>');
      i++;
      continue;
    }

    // blank line
    if (!line.trim()) { closeList(listStack); i++; continue; }

    // paragraph (join following non-special lines)
    closeList(listStack);
    var para = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{2,4}\s|```|&gt;\s?|[-*+]\s|\d+[.)]\s|\||(-{3,}|\*{3,})\s*$)/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  closeList(listStack);
  return out.join('\n');
}
window.mdToHtml = mdToHtml;
