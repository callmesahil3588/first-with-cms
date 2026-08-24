/* =============================================================
   /api/cms  —  the whole CMS backend, one file.

   Actions (POST JSON):  login | logout | list | load | save | delete

   Required environment variables (set these in Vercel):
     ADMIN_PASSWORD   the password you type to log in
     SESSION_SECRET   any long random string
     GITHUB_TOKEN     fine-grained token, Contents: Read+Write, this repo only
     GITHUB_REPO      e.g.  sahilthisside/portfolio
   Optional:
     GITHUB_BRANCH    defaults to main
     SITE_URL         e.g. https://yourdomain.com  (for canonical + og:url)

   Nothing secret ever reaches the browser. The token is only ever
   used inside this function.
   ============================================================= */

const crypto = require('crypto');
const API = 'https://api.github.com';
const COOKIE = 'cms_session';
const SESSION_HOURS = 8;

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

   // FAQ question + answer
// A standalone bold question followed by an answer becomes:
// <strong>Question?</strong><br>Answer
if (/^\*\*[^*]+\?\*\*$/.test(line.trim()) && i + 1 < lines.length && lines[i + 1].trim()) {
  closeList(listStack);

  var question = line.trim();
  var answer = [];
  i++;

  while (
    i < lines.length &&
    lines[i].trim() &&
    !/^(#{2,4}\s|```|&gt;\s?|[-*+]\s|\d+[.)]\s|\||(-{3,}|\*{3,})\s*$)/.test(lines[i])
  ) {
    answer.push(lines[i]);
    i++;
  }

  out.push('<p>' + inline(question) + '<br>' + inline(answer.join(' ')) + '</p>');
  continue;
}

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

/* ---------------- config ---------------- */
function config() {
  const missing = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'GITHUB_TOKEN', 'GITHUB_REPO']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    const e = new Error('Server not configured. Missing: ' + missing.join(', '));
    e.statusCode = 500;
    throw e;
  }
  return {
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.SESSION_SECRET,
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO.trim().replace(/^\/|\/$/g, ''),
    branch: process.env.GITHUB_BRANCH || 'main',
    site: (process.env.SITE_URL || '').replace(/\/+$/, ''),
  };
}

/* ---------------- auth ---------------- */
function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}
function issueSession(secret) {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return exp + '.' + hmac(exp, secret);
}
function sessionValid(cookieHeader, secret) {
  const m = /(?:^|;\s*)cms_session=([^;]+)/.exec(cookieHeader || '');
  if (!m) return false;
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length !== 2) return false;
  const expected = hmac(parts[0], secret);
  if (parts[1].length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return false;
  return Number(parts[0]) > Date.now();
}
function passwordMatches(given, actual) {
  const a = crypto.createHash('sha256').update(String(given == null ? '' : given)).digest();
  const b = crypto.createHash('sha256').update(String(actual)).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------------- github ---------------- */
async function gh(path, opts, c) {
  const res = await fetch(API + path, {
    method: (opts && opts.method) || 'GET',
    body: opts && opts.body,
    headers: {
      Authorization: 'Bearer ' + c.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'mini-cms',
    },
  });
  if (res.status === 404) { const e = new Error('not_found'); e.notFound = true; throw e; }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new Error('GitHub rejected the token. It is wrong or has expired — make a new one and update GITHUB_TOKEN in Vercel.');
    if (res.status === 403) throw new Error('GitHub refused the request. Check the token has Contents: Read and write on this repository.');
    if (res.status === 409 || /not a fast forward/i.test(text)) throw new Error('Someone (or another save) changed the repo at the same time. Wait a few seconds and save again.');
    if (/BadObjectState/.test(text)) throw new Error('GitHub refused the file change (BadObjectState). Usually a delete for a file that is not there. Reload the panel and try again.');
    throw new Error('GitHub ' + res.status + ': ' + text.slice(0, 300));
  }
  return res.status === 204 ? null : res.json();
}

async function readFile(path, c) {
  try {
    const data = await gh('/repos/' + c.repo + '/contents/' + encodeURI(path) + '?ref=' + c.branch, {}, c);
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (e) {
    if (e.notFound) return null;
    throw e;
  }
}

/* Commit several files in ONE commit, so one publish = one deploy.
   files: [{ path, text }] or [{ path, base64 }] or [{ path, remove:true }] */
async function pathExists(path, c) {
  try {
    await gh('/repos/' + c.repo + '/contents/' + encodeURI(path) + '?ref=' + c.branch, {}, c);
    return true;
  } catch (e) {
    if (e.notFound) return false;
    throw e;
  }
}

async function commitFiles(files, message, c) {
  const ref = await gh('/repos/' + c.repo + '/git/ref/heads/' + c.branch, {}, c);
  const headSha = ref.object.sha;
  const head = await gh('/repos/' + c.repo + '/git/commits/' + headSha, {}, c);
  const baseTree = head.tree.sha;

  /* GitHub's create-tree endpoint fails the WHOLE request if you ask it to
     delete a file that isn't there ("Returns an error if you try to delete a
     file that does not exist"). That happens routinely here — saving a brand
     new post as a draft tries to remove a page that was never written. So
     work out which paths really exist and drop the impossible deletions. */
  let existing = null;
  if (files.some((f) => f.remove)) {
    try {
      const full = await gh('/repos/' + c.repo + '/git/trees/' + baseTree + '?recursive=1', {}, c);
      if (full && !full.truncated && Array.isArray(full.tree)) {
        existing = new Set(full.tree.filter((t) => t.type === 'blob').map((t) => t.path));
      }
    } catch (e) {
      existing = null; // fall back to checking one path at a time
    }
  }

  const tree = [];
  for (const f of files) {
    if (f.remove) {
      const there = existing ? existing.has(f.path) : await pathExists(f.path, c);
      if (there) tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const payload = f.base64 !== undefined
      ? { content: f.base64, encoding: 'base64' }
      : { content: f.text, encoding: 'utf-8' };
    const blob = await gh('/repos/' + c.repo + '/git/blobs', { method: 'POST', body: JSON.stringify(payload) }, c);
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  /* nothing left to do (e.g. deleting something already gone) */
  if (!tree.length) return headSha;

  const newTree = await gh('/repos/' + c.repo + '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree }),
  }, c);

  const commit = await gh('/repos/' + c.repo + '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
  }, c);

  await gh('/repos/' + c.repo + '/git/refs/heads/' + c.branch, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  }, c);

  return commit.sha;
}

/* ---------------- helpers ---------------- */
function attr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slugify(s) {
  return String(s || '')
    .toLowerCase().trim()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}
function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function frontmatter(meta, body) {
  const keys = ['title', 'description', 'banner', 'date', 'category', 'draft'];
  const lines = keys.map((k) => k + ': ' + JSON.stringify(meta[k] === undefined ? '' : meta[k]));
  return '---\n' + lines.join('\n') + '\n---\n\n' + body.replace(/\r\n?/g, '\n').trim() + '\n';
}
function parseSource(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw || '');
  if (!m) return { meta: {}, body: raw || '' };
  const meta = {};
  m[1].split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i < 0) return;
    const key = line.slice(0, i).trim();
    try { meta[key] = JSON.parse(line.slice(i + 1).trim()); }
    catch (e) { meta[key] = line.slice(i + 1).trim(); }
  });
  return { meta, body: raw.slice(m[0].length) };
}

/* ---------------- page templates ---------------- */
const NAV = `<nav class="nav" id="nav">
<div class="wrap nav-inner">
<a href="/" class="logo">Sahil<em>.</em></a>
<button class="menu-toggle" id="menuToggle" aria-label="Open menu">&#9776;</button>
<ul class="nav-links" id="navLinks">
<li><a href="/#services">What I do</a></li>
<li><a href="/#process">How I work</a></li>
<li><a href="/#work">Results</a></li>
<li><a href="/blog">Insights</a></li>
<li><a href="/#contact" class="btn" style="padding:11px 22px">Let's talk</a></li>
</ul>
</div>
</nav>`;

const FOOTER = `<footer>
<div class="wrap" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;width:100%">
<span class="logo">Sahil<em>.</em></span>
<span>&copy; ${new Date().getFullYear()} &middot; Built with intent, measured with GA4.</span>
</div>
</footer>`;

function shell(o) {
  const og = o.image ? (o.site ? o.site + o.image : o.image) : '';
  const canonical = o.site ? o.site + o.path : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${attr(o.title)}</title>
<meta name="description" content="${attr(o.description)}" />
${canonical ? `<link rel="canonical" href="${attr(canonical)}" />` : ''}
<meta property="og:site_name" content="Sahil" />
<meta property="og:title" content="${attr(o.title)}" />
<meta property="og:description" content="${attr(o.description)}" />
<meta property="og:type" content="${o.article ? 'article' : 'website'}" />
${canonical ? `<meta property="og:url" content="${attr(canonical)}" />` : ''}
${og ? `<meta property="og:image" content="${attr(og)}" />` : ''}
<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${attr(o.title)}" />
<meta name="twitter:description" content="${attr(o.description)}" />
${og ? `<meta name="twitter:image" content="${attr(og)}" />` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&amp;family=Instrument+Sans:wght@400;500;600&amp;family=Space+Mono:wght@400;700&amp;display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ''}
</head>
<body>
${NAV}
${o.body}
${FOOTER}
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}

function postPage(meta, slug, bodyHtml, c) {
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    image: c.site ? c.site + meta.banner : meta.banner,
    author: { '@type': 'Person', name: 'Sahil' },
    mainEntityOfPage: c.site ? c.site + '/blog/' + slug : undefined,
  });
  const body = `<article class="article">
<a href="/blog" class="back">&larr; All insights</a>
<div class="meta">
${meta.category ? `<span class="cat">${attr(meta.category)}</span>` : ''}
<span>${attr(prettyDate(meta.date))}</span>
</div>
<h1>${attr(meta.title)}</h1>
<div class="article-banner"><img src="${attr(meta.banner)}" alt="${attr(meta.title)}" /></div>
<div class="prose">
${bodyHtml}
</div>
<div class="post-cta">
<h3>Want this run on your account?</h3>
<p>I take on a small number of performance and SEO engagements at a time.</p>
<a href="/#contact" class="btn">Let's talk</a>
</div>
</article>`;
  return shell({
    title: meta.title + ' — Sahil',
    description: meta.description,
    image: meta.banner,
    path: '/blog/' + slug,
    site: c.site,
    article: true,
    jsonld: jsonld,
    body: body,
  });
}

function card(p) {
  return `<article class="post reveal">
<a href="/blog/${attr(p.slug)}" aria-label="${attr(p.title)}"><div class="thumb"><img src="${attr(p.banner)}" alt="${attr(p.title)}" loading="lazy" /></div></a>
<div class="body">
${p.category ? `<span class="cat">${attr(p.category)}</span>` : ''}
<h3><a href="/blog/${attr(p.slug)}">${attr(p.title)}</a></h3>
<a class="read" href="/blog/${attr(p.slug)}">Read the note &rarr;</a>
<span class="date">${attr(prettyDate(p.date))}</span>
</div>
</article>`;
}

function blogIndexPage(posts, c) {
  const body = `<section class="page-head">
<div class="wrap">
<span class="eyebrow">Insights</span>
<h1>Notes from the trenches</h1>
<p>Things I've learned running real budgets &mdash; written for marketers, not algorithms.</p>
</div>
</section>
<div class="wrap">
${posts.length
      ? `<div class="blog-grid">\n${posts.map(card).join('\n')}\n</div>`
      : `<div class="empty">No posts published yet.</div>`}
</div>`;
  return shell({
    title: 'Insights — Sahil',
    description: 'Notes from running real marketing budgets: paid media, SEO, CRO and lifecycle marketing.',
    path: '/blog',
    site: c.site,
    body: body,
  });
}

const HOME_START = '<!--POSTS_START-->';
const HOME_END = '<!--POSTS_END-->';

function updateHomepage(html, posts) {
  const a = html.indexOf(HOME_START);
  const b = html.indexOf(HOME_END);
  if (a === -1 || b === -1) return null;
  const block = posts.length
    ? '\n' + posts.slice(0, 3).map(card).join('\n') + '\n'
    : '\n<div class="empty" style="grid-column:1/-1">First post coming soon.</div>\n';
  return html.slice(0, a + HOME_START.length) + block + html.slice(b);
}

/* ---------------- request body ---------------- */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; }
}

/* ---------------- handler ---------------- */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  let c;
  try { c = config(); }
  catch (e) { res.status(500).json({ error: e.message }); return; }

  const body = await readBody(req);
  const action = body.action;

  /* --- login --- */
  if (action === 'login') {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    if (!passwordMatches(body.password, c.password)) {
      res.status(401).json({ error: 'Wrong password.' });
      return;
    }
    res.setHeader('Set-Cookie',
      COOKIE + '=' + issueSession(c.secret) +
      '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + SESSION_HOURS * 3600);
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    res.status(200).json({ ok: true });
    return;
  }

  /* --- everything below needs a valid session --- */
  if (!sessionValid(req.headers.cookie, c.secret)) {
    res.status(401).json({ error: 'Session expired. Log in again.' });
    return;
  }

  try {
    const indexRaw = await readFile('data/posts.json', c);
    let posts = [];
    if (indexRaw) { try { posts = JSON.parse(indexRaw); } catch (e) { posts = []; } }
    if (!Array.isArray(posts)) posts = [];

    if (action === 'list') {
      res.status(200).json({ posts: posts });
      return;
    }

    if (action === 'load') {
      const raw = await readFile('data/posts/' + slugify(body.slug) + '.md', c);
      if (raw == null) { res.status(404).json({ error: 'Post not found.' }); return; }
      const parsed = parseSource(raw);
      res.status(200).json({ meta: parsed.meta, body: parsed.body.trim(), slug: slugify(body.slug) });
      return;
    }

    if (action === 'save') {
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const markdown = String(body.markdown || '');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
      const category = String(body.category || '').trim();
      const draft = !!body.draft;
      const slug = slugify(body.slug || title);
      const originalSlug = body.originalSlug ? slugify(body.originalSlug) : '';

      if (!title) { res.status(400).json({ error: 'Title is required.' }); return; }
      if (!description) { res.status(400).json({ error: 'Meta description is required.' }); return; }
      if (!markdown.trim()) { res.status(400).json({ error: 'The post body is empty.' }); return; }

      const files = [];
      let banner = String(body.banner || '').trim();

      /* new banner upload */
      if (body.bannerData) {
        const m = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(body.bannerData);
        if (!m) { res.status(400).json({ error: 'Banner must be a PNG, JPG, WebP, GIF or SVG image.' }); return; }
        const ext = m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1];
        const bytes = Buffer.from(m[2], 'base64').length;
        if (bytes > 4 * 1024 * 1024) { res.status(400).json({ error: 'Banner is over 4MB. Compress it first.' }); return; }
        banner = '/uploads/' + slug + '-' + Date.now().toString(36) + '.' + ext;
        files.push({ path: 'uploads' + banner.slice('/uploads'.length), base64: m[2] });
      }
      if (!banner) { res.status(400).json({ error: 'A banner image is required.' }); return; }

      const meta = { title, description, banner, date, category, draft };

      /* the portable source of truth */
      files.push({ path: 'data/posts/' + slug + '.md', text: frontmatter(meta, markdown) });

      /* the public page (drafts get no page at all) */
      if (draft) {
        files.push({ path: 'blog/' + slug + '.html', remove: true });
      } else {
        files.push({ path: 'blog/' + slug + '.html', text: postPage(meta, slug, mdToHtml(markdown), c) });
      }

      /* renamed? clean up the old files */
      if (originalSlug && originalSlug !== slug) {
        files.push({ path: 'data/posts/' + originalSlug + '.md', remove: true });
        files.push({ path: 'blog/' + originalSlug + '.html', remove: true });
        posts = posts.filter((p) => p.slug !== originalSlug);
      }

      posts = posts.filter((p) => p.slug !== slug);
      posts.push({ slug, title, description, banner, date, category, draft });
      posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      const live = posts.filter((p) => !p.draft);
      files.push({ path: 'data/posts.json', text: JSON.stringify(posts, null, 2) + '\n' });
      files.push({ path: 'blog/index.html', text: blogIndexPage(live, c) });

      let warning = '';
      const home = await readFile('index.html', c);
      if (!home) {
        warning = 'Saved, but no index.html found in the repo root, so the homepage cards were not updated.';
      } else {
        const updated = updateHomepage(home, live);
        if (updated === null) {
          warning = 'Saved, but the <!--POSTS_START--> comment is missing from index.html, so the homepage cards were not updated.';
        } else if (updated !== home) {
          files.push({ path: 'index.html', text: updated });
        }
      }

      const sha = await commitFiles(files, (draft ? 'draft: ' : 'post: ') + title, c);
      res.status(200).json({ ok: true, slug, draft, commit: sha.slice(0, 7), url: '/blog/' + slug, warning: warning });
      return;
    }

    if (action === 'delete') {
      const slug = slugify(body.slug);
      if (!posts.some((p) => p.slug === slug)) { res.status(404).json({ error: 'Post not found.' }); return; }
      posts = posts.filter((p) => p.slug !== slug);
      const live = posts.filter((p) => !p.draft);

      const files = [
        { path: 'data/posts/' + slug + '.md', remove: true },
        { path: 'blog/' + slug + '.html', remove: true },
        { path: 'data/posts.json', text: JSON.stringify(posts, null, 2) + '\n' },
        { path: 'blog/index.html', text: blogIndexPage(live, c) },
      ];
      const home = await readFile('index.html', c);
      if (home) {
        const updated = updateHomepage(home, live);
        if (updated && updated !== home) files.push({ path: 'index.html', text: updated });
      }
      await commitFiles(files, 'remove: ' + slug, c);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 400) });
  }
};

/* exported for local testing only */
module.exports.__internals = {
  mdToHtml, slugify, frontmatter, parseSource, postPage, blogIndexPage, updateHomepage, card,
};
