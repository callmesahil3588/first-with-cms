---
title: "Google Just Changed How Search Results Work: What google.com/goto Means for SEO, AI and Rank Tracking"
description: "Google confirmed it is routing search result links through google.com/goto redirects. Here's what changed, why it happened, and what it actually does to your SEO, rank tracking and AI visibility."
banner: "/uploads/google-just-changed-how-search-results-work-what-google-com-goto-means-for-seo-a-mtfv2r01.svg"
date: "2026-08-30"
category: "Insights"
draft: false
---

**On 26 August 2026**, Google confirmed something SEOs had been quietly arguing about since June: search result links no longer point directly at your website. They point at Google first.

If you hover over an organic result in a logged-out browser today, you won't see https://yoursite.com/page/. You'll see something closer to google.com/goto?url= followed by a long, unreadable string. Click it, and Google's server bounces you to the real page. You land where you always landed. You just take a detour on the way.

I've spent the past few days testing this across browsers and reading what the rank tracking vendors are publishing. Here's the honest read: this is not an algorithm update, it will not move your rankings, and there is nothing to fix on your site. But it does quietly change who can see Google's search results at scale — and that has real consequences for the dashboards you make decisions with.

### TL;DR ## 

Google now wraps organic result links (and some SERP features) in a google.com/goto?url=[encoded] redirect.

The destination is encoded, not decodable — a scraper has to follow each link to learn where it goes.

Google calls it a technical measure against abuse. The mechanism points squarely at scraping.

Your rankings are unaffected. Search Console and GA4 are, so far, unaffected.

Your rank tracking data may thin out or lag while providers adapt. Several already have.

**What is the google.com/goto redirect?**
The google.com/goto redirect is a server-side passthrough URL that Google places between a search result and its destination page. Instead of the result markup containing your page's address, it contains a Google-owned URL with your address encoded inside a parameter. A 302 temporary redirect then forwards the browser to the real page.

Two details matter here. First, the 302 status is deliberate — a temporary redirect tells any crawler that the wrapper is not meant to replace the destination address anywhere it gets stored. Second, the encoded value can't simply be decoded back into a URL. That's the whole point.

Not everyone sees it. Practitioners report the redirect consistently on logged-out searches and inconsistently when signed in. If you want to reproduce it, open an incognito window and hover a result. This is why two people checking the same query can genuinely disagree about whether the change has landed for them.

**How we got here**

This didn't appear overnight. Alex Greenland spotted rewritten result links on 23 June 2026. Brodie Clark of SERPAlerts flagged the 302 behaviour on 2 July. Barry Schwartz wrote it up as a test on 8 July and noted he couldn't reproduce it himself — which is roughly the difference between that report and this one.
By late August it was everywhere. Derek Perkins of the rank tracking platform Nozzle reported seeing it at <q>nearly a 100% rollout across several residential ip providers</q>. Google confirmed it the same day.

**Why is Google doing this?**
Google's official line, given to Search Engine Land, described a long track record of deploying technical measures against evolving forms of abuse and protecting its services and users. It did not say the word "scraping."
The mechanism says it for them.

Before this change, a tool could read a results page once and extract every destination URL straight from the HTML. Now it needs an extra request per link just to find out where each link points. Perkins put a number on it: resolving every link across a five-page ranking costs somewhere between 500 and 1,000 requests. And the cheap workaround is closed — Google reportedly rejects HEAD requests, which would have returned the redirect target without downloading anything. What decides who breaks is Google's rate limiting.

There's also legal context worth understanding, even if Google hasn't connected the dots publicly. In July 2026, a US federal court dismissed Google's DMCA claims against SerpApi, holding that bypassing anti-scraping controls to reach uncopyrighted search results isn't circumvention under that law. Google amended its complaint on 10 August, narrowing it to licensed content. One month after losing the legal route, a technical route shipped. That's a sequence, not a proven cause — but it's a sequence worth noticing.

**What actually breaks**
The people carrying the cost here are tool providers, not site owners. What reaches you is whatever their data looks like afterwards.

DemandSphere published a useful list of what fails when a system reads the link in a result and treats it as the destination:
Every destination URL resolves to google.com
Domain matching fails, so your own pages stop being recognised as yours
Share of voice and competitor attribution get calculated against the wrong domains
Historical trend lines snap on the rollout date
That last one is the trap. A chart that breaks on 26 August is a collection artefact, not a ranking collapse — but it will look identical to one in a client report.

The vendors moved fast. DemandSphere says organic ranking data is unaffected and it is rolling countermeasures out to SERP features. DataForSEO reported resolving direct destination URLs for 99.99% of SERPs, with the residual concentrated in AI Overviews, and shipped a fix for those on 28 August. Others will vary. Ask yours directly.

We have a precedent for how this plays out. When Google removed the num=100 parameter in September 2025, an analysis of 319 properties by Tyler Gargula found 77.6% lost query count in Search Console and 87.7% lost impressions — largely because the tools appending that parameter had been generating phantom impressions all along. The mechanism differs here, but the shape is the same: collection gets more expensive, and the depth of your data absorbs the cost.

**What it means for SEO** -
Almost nothing, directly. Say it plainly: google.com/goto is a click-path and data-access change. It does not touch crawling, indexing, ranking or relevance. No code change, no redirect rule, no schema update.
What it changes is your measurement hygiene:
Treat third-party rank data as provisional for a few weeks. Sparse or stale positions are a tooling story until proven otherwise.
Cross-check every sudden movement against Search Console. Search Console is built from Google's own logs, not by reading a results page, so the redirect doesn't sit between it and its data. If a tracked position swings and impressions don't, believe Search Console.
Annotate 26 August in your reporting. Future-you will thank present-you.
Watch referrer data, don't panic about it. The redirect stays on a Google domain, so GA4 should still classify these sessions as organic. Nobody has published measurements yet — so verify in your own property rather than assuming.

**What it means for AEO and GEO** -
This is the part most coverage skips.
Answer engines and generative engines need SERP data. Some AI systems ground their answers in live search results; a large share of the AEO and GEO tooling market — citation trackers, share-of-voice monitors, prompt-volume estimators — is built on top of SERP APIs that just got more expensive to run. If your AI visibility dashboard sources from a provider that hasn't adapted, its numbers are now suspect for the same reason your rank tracker's are.

DataForSEO's note that *AI Overviews* were the last surface to resolve is telling. AI Overview citations are exactly what GEO practitioners track, and they were the hardest to recover.

The strategic read is bigger than one redirect. Google spent 2025 and 2026 progressively closing the SERP: JavaScript gating in January, num=100 removed in September, AI Mode links carrying noreferrer, and now goto. Each step makes Google's results less legible to everyone except Google. If your entire visibility model depends on watching Google's results page from the outside, that model is being eroded on purpose.

The hedge is to own more of your measurement: Search Console, server logs (where AI crawlers like ChatGPT-User and GoogleOther-AI actually show up), and revenue. Those don't depend on Google's permission.

### **FAQ**

**What is google.com/goto?**
A Google-owned redirect URL that sits between a search result and its destination page, with the destination encoded rather than written out.

**Why is Google using google.com/goto?**
Officially, as a technical measure against abuse. Practically, it makes automated scraping of search results substantially more expensive.

**Does google.com/goto affect my SEO or rankings?**
No. It's infrastructure, not an algorithm update.

**How does it affect rank tracking?** 
Trackers must follow each redirect to recover destination URLs — up to 1,000 requests for a five-page ranking. Expect thinner or slower data until your provider adapts.

**Do I need to change anything on my website?**
No.
