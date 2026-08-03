/* Local end-to-end test. Mocks the GitHub API, runs the real handler. */
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple-99';
process.env.SESSION_SECRET = 'test-secret-value-long-enough';
process.env.GITHUB_TOKEN = 'ghp_fake';
process.env.GITHUB_REPO = 'sahil/portfolio';
process.env.SITE_URL = 'https://sahil.example.com';

const fs = require('fs');
const handler = require('./api/cms.js');

/* ---- fake GitHub ---- */
const repoFiles = {
  'index.html': fs.readFileSync('index.html', 'utf8'),
  'data/posts.json': '[]',
};
const committed = [];
let blobSeq = 0;
const blobs = {};

global.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  const json = (obj, status = 200) => ({ ok: status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) });

  if (/\/contents\/(.+)\?ref=/.test(u)) {
    const p = decodeURIComponent(/\/contents\/(.+)\?ref=/.exec(u)[1]);
    if (!(p in repoFiles)) return json({ message: 'Not Found' }, 404);
    return json({ content: Buffer.from(repoFiles[p]).toString('base64'), encoding: 'base64' });
  }
  if (/\/git\/ref\/heads\//.test(u)) return json({ object: { sha: 'HEADSHA' } });
  if (/\/git\/commits\/HEADSHA$/.test(u)) return json({ tree: { sha: 'TREESHA' } });
  if (/\/git\/blobs$/.test(u)) {
    const sha = 'blob' + ++blobSeq;
    blobs[sha] = body.encoding === 'base64' ? Buffer.from(body.content, 'base64').toString('utf8') : body.content;
    return json({ sha });
  }
  if (/\/git\/trees$/.test(u)) {
    committed.push(body.tree);
    return json({ sha: 'NEWTREE' });
  }
  if (/\/git\/commits$/.test(u)) return json({ sha: 'abcdef1234567890' });
  if (/\/git\/refs\/heads\//.test(u)) return json({ ok: true });
  throw new Error('unmocked GitHub call: ' + u);
};

/* ---- minimal Vercel-style res ---- */
function makeRes() {
  const r = {
    _status: 200, _json: null, _headers: {},
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; return this; },
    status(s) { this._status = s; return this; },
    json(o) { this._json = o; return this; },
  };
  return r;
}
function makeReq(payload, cookie) {
  return { method: 'POST', headers: cookie ? { cookie } : {}, body: payload };
}
async function call(payload, cookie) {
  const res = makeRes();
  await handler(makeReq(payload, cookie), res);
  return res;
}

/* ---- assertions ---- */
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
}

(async () => {
  console.log('\nAUTH');
  let r = await call({ action: 'login', password: 'wrong' });
  check('wrong password rejected', r._status === 401);

  r = await call({ action: 'login', password: 'correct-horse-battery-staple-99' });
  check('correct password accepted', r._status === 200);
  const setCookie = r._headers['set-cookie'] || '';
  check('cookie is HttpOnly', /HttpOnly/.test(setCookie));
  check('cookie is Secure', /Secure/.test(setCookie));
  check('cookie is SameSite=Strict', /SameSite=Strict/.test(setCookie));
  const cookie = 'cms_session=' + /cms_session=([^;]+)/.exec(setCookie)[1];

  r = await call({ action: 'list' });
  check('no cookie blocks list', r._status === 401);

  r = await call({ action: 'list' }, 'cms_session=999999999999.forgedsignature');
  check('forged cookie rejected', r._status === 401);

  r = await call({ action: 'list' }, cookie);
  check('valid cookie allows list', r._status === 200 && Array.isArray(r._json.posts));

  console.log('\nVALIDATION');
  r = await call({ action: 'save', title: '', description: 'd', markdown: 'x' }, cookie);
  check('empty title rejected', r._status === 400);
  r = await call({ action: 'save', title: 'T', description: '', markdown: 'x' }, cookie);
  check('empty description rejected', r._status === 400);
  r = await call({ action: 'save', title: 'T', description: 'd', markdown: '' }, cookie);
  check('empty body rejected', r._status === 400);
  r = await call({ action: 'save', title: 'T', description: 'd', markdown: 'x' }, cookie);
  check('missing banner rejected', r._status === 400, JSON.stringify(r._json));
  r = await call({ action: 'save', title: 'T', description: 'd', markdown: 'x', bannerData: 'data:text/html;base64,PHNjcmlwdD4=' }, cookie);
  check('non-image banner rejected', r._status === 400);

  console.log('\nPUBLISH');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  r = await call({
    action: 'save',
    title: "Why your ROAS is lying to you",
    description: 'A sanity check before trusting any ad dashboard.',
    category: 'Paid Media',
    date: '2026-08-03',
    draft: false,
    markdown: '## Heading\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two',
    bannerData: 'data:image/png;base64,' + png,
  }, cookie);
  check('publish succeeded', r._status === 200, JSON.stringify(r._json));
  check('slug generated', r._json && r._json.slug === 'why-your-roas-is-lying-to-you', r._json && r._json.slug);

  const tree = committed[committed.length - 1];
  const paths = tree.map((t) => t.path).sort();
  console.log('  files in the single commit:');
  paths.forEach((p) => console.log('     - ' + p));
  check('one commit only', committed.length === 1);
  check('banner committed', paths.some((p) => /^uploads\/why-your-roas.*\.png$/.test(p)));
  check('markdown source committed', paths.includes('data/posts/why-your-roas-is-lying-to-you.md'));
  check('post page committed', paths.includes('blog/why-your-roas-is-lying-to-you.html'));
  check('blog index regenerated', paths.includes('blog/index.html'));
  check('post index updated', paths.includes('data/posts.json'));
  check('homepage updated', paths.includes('index.html'));

  const byPath = {};
  tree.forEach((t) => { byPath[t.path] = blobs[t.sha]; });
  const home = byPath['index.html'];
  check('homepage card injected', home.includes('/blog/why-your-roas-is-lying-to-you'));
  check('homepage empty state removed', !home.includes('First post coming soon'));
  check('homepage markers preserved', home.includes('<!--POSTS_START-->') && home.includes('<!--POSTS_END-->'));

  const post = byPath['blog/why-your-roas-is-lying-to-you.html'];
  check('post has og:image', /og:image" content="https:\/\/sahil\.example\.com\/uploads\//.test(post));
  check('post has canonical', post.includes('rel="canonical"'));
  check('post has JSON-LD', post.includes('"@type":"BlogPosting"'));
  check('markdown rendered', post.includes('<h2>Heading</h2>') && post.includes('<strong>bold</strong>'));

  const src = byPath['data/posts/why-your-roas-is-lying-to-you.md'];
  check('source has frontmatter', src.startsWith('---\ntitle:'));

  console.log('\nDRAFT');
  repoFiles['data/posts.json'] = byPath['data/posts.json'];
  repoFiles['index.html'] = home;
  committed.length = 0;
  r = await call({
    action: 'save', title: 'Secret draft', description: 'not ready',
    date: '2026-08-04', draft: true, markdown: 'hidden text',
    bannerData: 'data:image/png;base64,' + png,
  }, cookie);
  check('draft saved', r._status === 200, JSON.stringify(r._json));
  const dtree = committed[0].map((t) => t.path);
  const removals = committed[0].filter((t) => t.sha === null).map((t) => t.path);
  check('draft page is removed not written', removals.includes('blog/secret-draft.html'));
  const dHome = (function () { const e = committed[0].find((t) => t.path === 'index.html'); return e ? blobs[e.sha] : ''; })();
  check('draft absent from homepage', !dHome.includes('secret-draft'));
  const dList = blobs[committed[0].find((t) => t.path === 'blog/index.html').sha];
  check('draft absent from blog list', !dList.includes('secret-draft'));

  console.log('\nDELETE');
  repoFiles['data/posts.json'] = blobs[committed[0].find((t) => t.path === 'data/posts.json').sha];
  committed.length = 0;
  r = await call({ action: 'delete', slug: 'why-your-roas-is-lying-to-you' }, cookie);
  check('delete succeeded', r._status === 200, JSON.stringify(r._json));
  const delTree = committed[0].filter((t) => t.sha === null).map((t) => t.path);
  check('post page deleted', delTree.includes('blog/why-your-roas-is-lying-to-you.html'));
  check('source deleted', delTree.includes('data/posts/why-your-roas-is-lying-to-you.md'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
