# Your own CMS — setup

No Astro. No npm. No build step. Your site is plain HTML files again.
One password, one form at `/admin`, and posts publish straight to your GitHub repo.

**Tested before shipping:** 37 automated tests covering login, forged sessions,
input validation, publishing, drafts and deletion. Run them yourself any time with
`node _test.js`.

---

## How it works

You write in `/admin`. When you hit Save, a small function on your own site
(`/api/cms`) checks your password, generates a finished HTML page for the post,
and commits everything to GitHub in **one commit**. Vercel sees the commit and
redeploys. About a minute later the post is live.

Nothing runs on your visitors' machines. Every post is a real HTML file with its
own title, meta description and social share image — so Google and LinkedIn see
proper pages, not JavaScript.

---

## Setup (about 15 minutes, once)

### 1. Copy these files into your repo

Copy everything here into your repository root, and **delete the old
`sahil-portfolio.html`**. The new `index.html` replaces it.

### 2. Make a GitHub token

This is how the CMS writes to your repo.

1. GitHub → your profile photo → **Settings**
2. Bottom of the left menu → **Developer settings**
3. **Personal access tokens → Fine-grained tokens → Generate new token**
4. Set:
   - **Repository access:** Only select repositories → pick this one repo only
   - **Permissions → Repository permissions → Contents:** change to **Read and write**
   - **Expiration:** set the longest you're comfortable with
5. Generate, then **copy the token now** — GitHub never shows it again.

The token only has access to this one repository, and only to its files.

### 3. Add 5 settings in Vercel

Vercel project → **Settings → Environment Variables**. Add each one for
**Production** (and Preview if you want to test there):

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | The password you'll type to log in. Make it long — 20+ characters. |
| `SESSION_SECRET` | Any long random string. Mash your keyboard. Never typed by you. |
| `GITHUB_TOKEN` | The token from step 2. |
| `GITHUB_REPO` | `yourusername/your-repo-name` |
| `SITE_URL` | `https://yourdomain.com` — no trailing slash |

Optional: `GITHUB_BRANCH` if your branch isn't called `main`.

### 4. Check the build settings

Because there's no build step now, Vercel project → **Settings → Build & Deployment**:

| Setting | Value |
|---|---|
| Framework Preset | **Other** |
| Build Command | *leave empty* |
| Output Directory | *leave empty* |
| Install Command | *leave empty* |

### 5. Push, then log in

```bash
git add .
git commit -m "Own CMS"
git push
```

Go to `yourdomain.com/admin`, enter your password, and publish a test post.

---

## Publishing, daily

1. Open `/admin` (bookmark it on your phone home screen)
2. Title → the link is generated from it automatically
3. Meta description → the counter shows when you're near the 160-character sweet spot
4. Pick a banner, pick a category
5. Write. Select text and click **Bold**, **Heading**, **Link** — you never need to
   remember any syntax. **Preview** shows exactly how it will look.
6. Uncheck **Keep as draft** and hit **Save**

Drafts are safe: no page is generated, and they're kept out of the deployment
entirely, so an unfinished post cannot be found by anyone.

Editing an existing post works the same way — hit **Edit** in the list at the top.

---

## What's in each folder

```
index.html          your landing page (the CMS rewrites only the region
                    between <!--POSTS_START--> and <!--POSTS_END-->)
blog/index.html     the /blog listing — regenerated on every publish
blog/*.html         one finished page per post — generated
admin/index.html    the panel. Just HTML and JS, no build.
api/cms.js          the whole backend, one file, heavily commented
assets/site.js      nav, mobile menu, scroll animations
assets/md.js        the preview renderer (same code as the server's copy)
styles.css          all your CSS in one place
data/posts.json     the list of posts
data/posts/*.md     your writing, in plain Markdown ← this is the real content
uploads/            banner images
vercel.json         makes URLs clean (/blog/post, not /blog/post.html)
.vercelignore       keeps drafts off the public site
```

**`data/posts/*.md` is what actually matters.** Plain text with a few lines of
detail at the top. If everything else burned down, those files are your blog, and
any tool on earth can read them.

---

## Safety

**Backups.** Repo page → Code → Download ZIP gives you the entire site in one
file. Once a month is plenty. Deleted a post by accident? It's still in your
GitHub commit history — nothing is ever really gone.

**If you delete the CMS.** Delete `/admin` and `/api` and your site keeps working
perfectly. Every published page is already a plain HTML file. You'd just be back to
editing by hand.

**The password.** It's checked on the server, never stored in the browser, and
compared in a way that doesn't leak timing. Login is deliberately slowed to make
guessing impractical. Sessions last 8 hours, then you log in again. Use a long
password and this is genuinely fine for a personal site.

**If the token expires**, publishing fails with a GitHub 401. Make a new token
(step 2) and update `GITHUB_TOKEN` in Vercel. Nothing is lost.

---

## Changing the design later

- Site-wide look → `styles.css`
- Landing page → `index.html`
- **The post page layout lives in `api/cms.js`**, in the `postPage` function. Change
  it there, then re-save any post to regenerate it with the new layout.

---

## If something breaks

| What you see | What it means |
|---|---|
| "Server not configured. Missing: …" | An environment variable is missing in Vercel. Add it, then redeploy. |
| "GitHub 401" | Token is wrong or expired. Make a new one. |
| "GitHub 404" | `GITHUB_REPO` is wrong, or the token wasn't given access to this repo. |
| "GitHub 409" | Two saves at once. Wait a few seconds and save again. |
| Post saved but site unchanged | Check Vercel's Deployments tab — the commit landed but the deploy may have failed. |
| Homepage cards don't update | The `<!--POSTS_START-->` comment in `index.html` got deleted. Put it back. |
| `/admin` shows raw HTML | Build settings — see step 4. |
