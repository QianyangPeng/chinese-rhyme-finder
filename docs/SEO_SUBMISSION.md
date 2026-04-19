# Search engine submission checklist

The site is now optimised for indexing — `robots.txt`, `sitemap.xml`,
`site.webmanifest`, an OG card, JSON-LD `WebApplication` schema, and
per-page meta descriptions / canonical URLs are all live at
`https://qianyangpeng.github.io/chinese-rhyme-finder/`.

To actually get indexed, you still need to register the site with each
search engine. **All free, ~5 minutes per engine.**

---

## 1. Google Search Console (most important globally)

1. Go to <https://search.google.com/search-console>
2. Add a **URL prefix** property: `https://qianyangpeng.github.io/chinese-rhyme-finder/`
3. Verify ownership — pick one of:
   - **Easiest**: "Domain name provider" doesn't apply on GitHub Pages,
     so use the **HTML tag** method. GSC will give you a
     `<meta name="google-site-verification" content="..." />` tag.
     Paste it into `src/app.html` inside `<head>`, deploy, then click
     "Verify" in GSC.
   - **Or**: download the `googleXXX.html` file and drop it in `static/`,
     commit, deploy, then verify.
4. Once verified, in the left sidebar pick **Sitemaps** and submit:
   `https://qianyangpeng.github.io/chinese-rhyme-finder/sitemap.xml`
5. Optionally hit **URL Inspection** on the homepage and click
   "Request indexing" to push the first crawl now (otherwise it
   usually takes 1–7 days).

## 2. Bing Webmaster Tools (covers Bing + DuckDuckGo + Ecosia)

1. Go to <https://www.bing.com/webmasters>
2. Sign in (Microsoft account) → "Add a site"
3. **Shortcut**: if you already verified with Google, Bing has an
   "Import from Google Search Console" button — one click and you're done.
4. Otherwise verify via meta tag (same flow as GSC, different tag name).
5. Submit the sitemap URL.

## 3. Baidu (essential for the Chinese audience)

Baidu is harder because it's slower to crawl GitHub Pages and
sometimes dislikes overseas-hosted sites — but for this tool's
audience it's the highest-value one.

1. Go to <https://ziyuan.baidu.com/site/index> (百度搜索资源平台)
2. Sign up / log in with a Baidu account.
3. **Add site** (普通收录) → enter `qianyangpeng.github.io`. Note: Baidu
   verifies at the **domain root**, not the subpath — and you can't
   add files to the root of `github.io` from this repo. Two options:
   - **Use a custom domain**: buy a domain (e.g. `yayun.run`), point
     it to GitHub Pages via CNAME — Baidu can verify this domain and
     it ranks better in Chinese search anyway.
   - **Auto-discover via sitemap**: if you can't verify, you can still
     manually submit URLs at the **链接提交 → 手动提交** page (limit
     ~20/day). Submit the four URLs from `sitemap.xml`.
4. Once verified, submit the sitemap at **链接提交 → sitemap**.

> 💡 If you do buy a domain, also update:
> - `src/app.html` canonical / og:url
> - `static/sitemap.xml` URLs
> - `static/site.webmanifest` start_url
> - `svelte.config.js` `paths.base` (set to `''` for root domain)

## 4. (Optional) 360 / Sogou / Yandex

- **360 搜索**: <https://zhanzhang.so.com/> — same flow as Baidu.
- **Sogou**: <https://zhanzhang.sogou.com/> — same flow.
- **Yandex**: <https://webmaster.yandex.com/> — useful if you care
  about Russian-speaking users.

## 5. After submission — monitor

- **GSC**: check "Coverage" tab after a week to see indexed pages.
  "Performance" tab shows search queries that found you.
- **Bing**: same idea, "Search Performance".
- **Baidu**: 索引量 (index volume) tab.

## 6. Things you can also do to rank better

- **Get backlinks**: post on V2EX / 知乎 / Reddit r/ChineseLanguage,
  add to "awesome" GitHub lists like `awesome-chinese-nlp`.
- **Add content**: a `/about/` page with the algorithm explanation
  helps long-tail queries like "中文押韵算法".
- **Custom domain**: a `.com`/`.cn` domain dramatically helps Baidu;
  GitHub Pages on `github.io` is sometimes filtered.

---

## What's already done in the codebase

| File | Purpose |
|------|---------|
| `src/app.html` | Default `<title>`, description, keywords, canonical, OG, Twitter card, JSON-LD |
| `src/routes/+page.svelte` | Per-page title + description + canonical |
| `src/routes/discover/+page.svelte` | Per-page title + description + canonical |
| `src/routes/search/+page.svelte` | Per-page title + description + canonical |
| `src/routes/analyze/+page.svelte` | Per-page title + description + canonical |
| `static/robots.txt` | Allow all, disallow `/data/` blobs, sitemap pointer |
| `static/sitemap.xml` | All 4 routes |
| `static/site.webmanifest` | PWA manifest (installable) |
| `static/og-image.svg` | 1200×630 social card |
