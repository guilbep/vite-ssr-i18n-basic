# vite-ssr-i18n-basic

[![npm version](https://img.shields.io/npm/v/vite-ssr-i18n-basic.svg)](https://www.npmjs.com/package/vite-ssr-i18n-basic)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Vite plugin that turns [Eta](https://eta.js.org/) templates + locale JSON files into a multi-locale static site. Generates one HTML file per page per locale, plus per-locale sitemaps, 404 pages, and webmanifests. Processes CSS/JS/images with cache-busting hashes and optional WebP conversion.

Designed to be light: the [demo site](./src) ships under 8 KB total transfer per locale.

> **Renamed in 3.0.0**: previously published as `vite-ssr-nunjucks-i18n-basic` (Nunjucks-backed). The 3.x line replaces the templating engine with Eta — see [CHANGELOG](./CHANGELOG.md) for the migration guide.

## Install

```bash
npm install vite-ssr-i18n-basic
```

## Quick start

`vite.config.js`:

```js
import { defineConfig } from "vite";
import { createMultiLocalePlugin } from "vite-ssr-i18n-basic";

export default defineConfig({
  plugins: [
    createMultiLocalePlugin({
      locales: ["en", "fr"],
      defaultLocale: "en",
      siteUrl: "https://example.com",
    }),
    // Vite needs an entry; this gives it one and discards the output.
    {
      name: "virtual-entry",
      resolveId(id) { if (id === "virtual:static-site") return id; },
      load(id) { if (id === "virtual:static-site") return ""; },
    },
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: { input: "virtual:static-site", output: { entryFileNames: ".vite/[name].js" } },
  },
});
```

Then `npm run build` and the plugin emits `dist/en/`, `dist/fr/`, sitemaps, etc.

## Required directory layout

```
.
├── routes.config.json     # route table (see below)
├── src/
│   ├── pages/             # *.eta pages (one per route key)
│   ├── layouts/           # base templates (referenced via `<% layout() %>`)
│   ├── partials/          # includes (`<%~ include() %>`)
│   ├── data/
│   │   ├── en.json        # locale data — keys consumed by `t()`
│   │   ├── fr.json
│   │   └── meta.json      # site-wide non-locale data
│   └── assets/
│       ├── css/           # processed, hashed, manifested
│       ├── js/            # processed, hashed, manifested
│       └── images/        # hashed; png/jpg/jpeg get WebP siblings
└── public/                # copied to dist/ verbatim
```

All of `src/`, `src/pages`, `src/layouts`, `src/partials`, `src/data` must exist or the plugin throws on startup.

## routes.config.json

```json
{
  "hostname": "https://example.com",
  "locales": ["en", "fr"],
  "basePath": { "en": "/en", "fr": "/fr" },
  "routes": [
    { "key": "landing_page", "path": "/", "title": { "en": "Home", "fr": "Accueil" } },
    { "key": "about", "path": { "en": "/about", "fr": "/a-propos" } },
    { "key": "404", "path": "/404", "hidden": true }
  ]
}
```

- `key` matches the page filename (`src/pages/<key>.eta`).
- `path` is appended to `basePath[locale]`. Can be a string (same for all locales) or an object per locale.
- `landing_page` is special — used by the 404 and webmanifest generators to determine the per-locale output directory.

## Locale data

`src/data/<locale>.json` is spread into every template's context. Use nested keys with `t()`:

```json
{
  "homepage": { "title": "Welcome", "greeting": "Hello {{name}}!" }
}
```

```eta
<%= t('homepage.title') %>
<%= t('homepage.greeting', { name: 'Pierre' }) %>
```

Missing keys fall back to `defaultLocale`, then to the key string.

## Template syntax (Eta cheatsheet)

The plugin is configured with `useWith: true`, so render-context fields are exposed as bare identifiers (no `it.` prefix). The full Eta reference is at [eta.js.org](https://eta.js.org/), but in practice you'll only need:

| Eta                              | Output                                                         |
|----------------------------------|----------------------------------------------------------------|
| `<%= expr %>`                    | HTML-escaped output                                            |
| `<%~ expr %>`                    | Raw (unescaped) output — for trusted HTML, JSON, inlined CSS   |
| `<% code %>`                     | Run JS, no output (use for `if`, `for`, etc.)                  |
| `<% layout('/layouts/main') %>`  | Wrap this template's render in another layout                  |
| `<%~ body %>`                    | (Inside a layout) inject the child template's output           |
| `<%~ include('/partials/x') %>`  | Inline a partial                                               |

## Template helpers

All helpers are available as bare identifiers in templates.

| Helper                          | What it does                                                                                                       |
|---------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `t(key, params?)`               | Translate. Supports nested keys and `{{param}}` interpolation.                                                     |
| `asset(logicalPath)`            | Resolve a logical path (e.g. `/assets/styles/main.css`) to its hashed physical path via the manifest.              |
| `inline_asset(logicalPath)`     | Read the processed (minified, hashed) asset's contents and return them inline. Pair with `<%~` for critical CSS.   |
| `data_uri(logicalPath)`         | Return a `data:` URI (MIME inferred; SVG URL-encoded, others base64). Pair with `<%~` to inline a small LCP image. |
| `manifest`                      | The full asset manifest object.                                                                                    |
| `getLocalizedUrl(path, locale)` | Localized URL for the current page in another locale (hreflang).                                                   |
| `getRouteUrl(key, locale?)`     | URL for a route by key.                                                                                            |
| `isCurrentLocale(locale)`       | `true` when rendering for `locale`.                                                                                |
| `url`, `absoluteUrl`, `eq`, `locale_url` | Small URL helper functions.                                                                               |

Per-render context also includes: `locale`, `locales`, `alternates`, `defaultLocale`, `rtl`, `meta` (from `meta.json`), `navItems`, `themeColor`, `page`, plus everything from the active locale data.

### Inlining critical CSS (example)

```eta
<style><%~ inline_asset('/assets/styles/main.css') %></style>
```

Removes the render-blocking stylesheet request entirely. CSS still lives in `src/assets/css/` as an editable source file — the plugin minifies, hashes, and inlines the processed version at template render time.

### Inlining a small LCP image (example)

```eta
<img src="<%~ data_uri('/assets/images/avatar.webp') %>" alt="…" width="200" height="200">
```

The LCP image then ships inside the HTML — no extra request, no extra RTT. Good for tiny images (≤ a few KB). Use sparingly — base64 inflates by ~33 % and is mostly incompressible, so it only pays off for assets small enough to keep your HTML well under the [14 KB initial-window rule](https://endtimes.dev/why-your-website-should-be-under-14kb-in-size/).

## Plugin options

All options have sensible defaults:

| Option | Default | Notes |
|---|---|---|
| `srcDir` | `"src"` | |
| `pagesDir` | `"src/pages"` | |
| `layoutsDir` | `"src/layouts"` | |
| `partialsDir` | `"src/partials"` | |
| `dataDir` | `"src/data"` | |
| `outputDir` | `"dist"` | Production output. |
| `devOutputDir` | `".tmp"` | Dev mode output (cleaned on exit). |
| `defaultLocale` | `"en"` | Must appear in `locales`. |
| `locales` | `["en", "fr"]` | |
| `siteUrl` | `"https://example.com"` | Used in sitemaps and `absoluteUrl`. |
| `localesMeta` | `{}` | Per-locale `{ name, rtl }`. |
| `emitSitemaps` | `true` | |
| `emit404s` | `true` | |
| `emitWebmanifest` | `true` | Set to `false` to skip per-locale `site.webmanifest` generation. |
| `linkRewrite` | `"safety-net"` | `"off"` disables. |
| `emitRootRedirect` | `locales.length > 1` | Root `index.html` that redirects to the visitor's language. Off by default for a single locale, so a page routed to `/` is not overwritten. |
| `markdown` | `{}` | `.md` pages: `{ layout, eta, extensions }`. See [Markdown pages](#markdown-pages). |
| `minifyHtml` | `true` | Minify every emitted HTML file (pages, 404s, root redirect) in production with `html-minifier-terser`. On large sites this dominates build time; `false` skips it. |
| `copyPublic` | `true` | |

## Markdown pages

`.md` files in `pagesDir` render straight to HTML next to `.eta` pages, and the dev server reloads them on save. A page without a `routes.config.json` entry gets one: `index.md` → `/`, `guide/setup.md` → `/guide/setup`. List it there to give it localized paths or titles.

```markdown
---
title: Setup # default: the first # heading
layout: /layouts/docs # default: markdown.layout, then /layouts/main
eta: true # run Eta over this page first (default: markdown.eta)
---

# Setup

<%= t('setup.intro') %>
```

The layout receives everything an `.eta` page gets, plus `title`, `frontmatter` and `body` (the rendered HTML, output with `<%~ body %>`). Headings get GitHub-style ids, and relative `*.md` links point to the `.html` pages. Images in `pagesDir` (png, jpg, jpeg, gif, svg, webp, avif) are copied as-is to the same relative path under each locale's `basePath`: `pagesDir/img/a.png` → `<out><basePath>/img/a.png`.

The Eta pass is off by default: with it on, any `<%` in the page, code samples included, is executed. Turn it on for pages that need `t()` or other helpers.

```js
createMultiLocalePlugin({
  markdown: {
    layout: "/layouts/main",
    eta: false,
    extensions: [], // passed to marked.use(), after the built-ins
  },
});
```

## Co-located page variants

```
src/pages/about.eta        # default
src/pages/about.fr.eta     # used for /fr/
```

The locale-specific file wins; otherwise the default is used and the missing locale appears in `alternates` for hreflang.

## Asset pipeline

- **CSS**: `@import` resolved + concatenated, minified in prod, hashed.
- **JS**: minified in prod, hashed. Exposed to templates via `<name>Hash` keys in `assetHashes`.
- **Images** (`png/jpg/jpeg/webp/avif/svg/gif`): in prod, optimized via [sharp](https://sharp.pixelplumbing.com/) (`sharp` is an `optionalDependency` — install if you need image processing) and given a WebP sibling. Cached by content hash for incremental builds.

The mapping logical → physical is exposed as the `manifest` helper.

## Demo

The [`src/`](./src), [`routes.config.json`](./routes.config.json), and [`vite.config.js`](./vite.config.js) in this repo are a working demo. `npm install && npm run build` produces `dist/en/` and `dist/fr/`.

## Contributing

PRs welcome. See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT
