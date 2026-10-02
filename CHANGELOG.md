# Changelog

All notable changes to this project are documented in this file. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [3.1.0] – 2026-10-02

### Added
- `emitRootRedirect` option. Defaults to `locales.length > 1`.
- `minifyHtml` option (default `true`). Applies to pages, 404s and the root redirect. On a 386-page site, minification was 1.5 s of a 1.8 s `vite build` (#3).

### Changed (behaviour)
- **Single-locale sites no longer get a root redirect by default.** It overwrote any page routed to `/`. A single-locale site on a prefixed `basePath` (e.g. `/en`) that relied on it now needs `emitRootRedirect: true`.
- **A page that fails to render now fails the production build.** It used to log `✗ Error rendering …` and exit 0 with the page missing. The dev server still logs and keeps running.
- Required directories are checked when a build or dev server starts, not when `vite.config.js` loads, so a generator can create `pagesDir` first.

### Security
- Optional dependency `sharp` bumped to `^0.35.5` (libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591; libheif GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545). `^0.34.3` could not reach the fix.

### Fixed
- Locale index routes (`/<locale>/` → `<locale>/index.html`) and the link rewriter worked only for `en` and `fr`; they now use the configured `locales` and `basePath`.
- Removed two debug logs (the asset manifest and the full page list) printed on every build.

## [3.0.0] – 2026-05-27

### Changed (breaking)
- **Package renamed**: `vite-ssr-nunjucks-i18n-basic` → `vite-ssr-i18n-basic`. The old name remains on npm at 2.x for legacy installs; new releases ship under the new name.
- **Templating engine swapped from Nunjucks to [Eta](https://eta.js.org/)** (Nunjucks last release April 2023; Eta last release April 2026). All site templates must be rewritten:
  - File extension: `.njk` → `.eta`
  - `{% extends "main.njk" %}` + `{% block content %}…{% endblock %}` → `<% layout('/layouts/main') %>…` (the layout uses `<%~ body %>` to inject the child)
  - `{% include "x" %}` → `<%~ include('/partials/x') %>`
  - `{% if … %} … {% endif %}` / `{% for x in xs %} … {% endfor %}` → native JS inside `<% … %>`
  - `{{ var }}` (escaped) → `<%= var %>`
  - `{{ var | safe }}` (raw) → `<%~ var %>`
  - `{{ list | dump | safe }}` → `<%~ JSON.stringify(list) %>`
  - `{{ var | upper }}` → `<%= var.toUpperCase() %>`
- Filters registered via `env.addFilter(...)` are gone. The plugin still exposes `url`, `absoluteUrl`, `eq`, `locale_url` as plain helper functions on every render — call them as `<%= absoluteUrl(x, base) %>` instead of piping `{{ x | absoluteUrl(base) }}`.
- `inline_asset` and `data_uri` no longer return Nunjucks `SafeString`. Use the raw output prefix at the template level: `<%~ inline_asset('/x.css') %>`.

### Internal
- `nunjucks` dependency removed; `eta@^4.6.0` added (smaller dep tree, zero new vulnerabilities).
- Eta is instantiated with `useWith: true`, `autoEscape: true`, `cache: false`, `views: srcDir`. The single `views` root lets templates reference partials/layouts/pages by absolute path (`/layouts/main`, `/partials/head`, `/pages/foo`).
- Generators (sitemap, notfound, webmanifest, root-redirect) now use isolated Eta instances rooted at the plugin's bundled `plugins/templates/` directory.
- `PageRenderer.setNunjucksEnv` → `PageRenderer.setEta`; new `PageRenderer.setGlobals` accepts the helpers object that gets spread into every render's data. Same change on `NotFoundGenerator`.

### Migration
Verified on a real consumer site: rendered HTML output is byte-identical to the previous Nunjucks build for the same templates (after the mechanical syntax conversion above).

## [2.4.0] – 2026-05-26

### Added
- New plugin option `emitWebmanifest` (default `true`). Set to `false` to skip generating per-locale `site.webmanifest` files. Useful for non-PWA sites where the manifest just adds a request to the critical path.

## [2.3.0] – 2026-05-26

### Changed
- The webmanifest generator now honours `icons`, `theme_color`, `background_color`, and `display` from the consumer's `public/site.webmanifest` (previously these were hardcoded in the bundled template). Falls back to the prior defaults when `public/site.webmanifest` is absent or doesn't declare a field, so existing setups keep working without changes.
- `dir` (text direction) is now emitted in the generated webmanifest, derived from `localesMeta[locale].rtl` like elsewhere in the plugin.

### Fixed
- Removed the hardcoded `"INPLUGS CO2 Calculator"` description fallback — defaults to an empty string when nothing else resolves. Generic plugin consumers should never have seen INPLUGS in their output, but it's worth being explicit.

## [2.2.0] – 2026-05-26

### Added
- New Nunjucks global `data_uri(logicalPath)` — returns the asset as a `data:` URI. Inferred MIME type from the file extension; SVG is URL-encoded (smaller and still human-readable), everything else is base64. Lets templates inline small images (avatars, logos) so the LCP image arrives in the first network round-trip alongside the HTML:

  ```njk
  <img src="{{ data_uri('/assets/images/avatar.webp') }}" alt="…">
  ```

## [2.1.0] – 2026-05-26

### Added
- New Nunjucks global `inline_asset(logicalPath)` — resolves the path through the asset manifest and returns the file contents as a `SafeString`. Lets templates inline processed (minified, hashed) CSS/JS straight into the document for critical-path optimisation:

  ```njk
  <style>{{ inline_asset('/assets/styles/main.css') }}</style>
  ```

## [2.0.1] – 2026-05-26

### Fixed
- `NotFoundGenerator` was emitting `dist/404.html` instead of `dist/<locale>/404.html` when the `landing_page` route used `path: "/"`. The locale directory is now derived by taking the first non-empty segment of the resolved path (matching `WebmanifestGenerator`'s behaviour) — `dirname("en/")` returns `"."`, which collapsed all locales into a single file.

## [2.0.0] – 2026-05-26

### Added
- Initial npm release. Extracted the plugin from the [INPLUGS-CO2](https://github.com/EPFL-ENAC/INPLUGS-CO2) repo and packaged it for distribution.
- Modular structure under `plugins/`:
  - `utils/locale-utils.js` — shared route/locale/translator helpers.
  - `utils/asset-processor.js` — CSS/JS/image pipeline with cache-busting hashes and optional WebP conversion via [sharp](https://sharp.pixelplumbing.com/).
  - `utils/page-renderer.js` — per-locale page rendering with hreflang `alternates`, route-based output paths, and link rewriting.
  - `generators/sitemap-generator.js` — per-locale sitemaps + sitemap-index.
  - `generators/notfound-generator.js` — per-locale `404.html` generation.
  - `generators/webmanifest-generator.js` — per-locale `site.webmanifest`.
  - `generators/root-redirect-generator.js` — root `index.html` with cookie-based language detection.
- Bundled Nunjucks templates for the four generators (`templates/*.njk`). Loaded via `import.meta.url` so the plugin works regardless of consumer CWD.
- Each generator uses an isolated `nunjucks.Environment` to avoid mutating the user's global env.
- `package.json` exposes `main`/`exports`/`files` for installable npm distribution. `vite` is a `peerDependency`; `sharp` is an `optionalDependency`.

[3.0.0]: https://github.com/guilbep/vite-ssr-i18n-basic/releases/tag/v3.0.0
[2.4.0]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.4.0
[2.3.0]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.3.0
[2.2.0]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.2.0
[2.1.0]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.1.0
[2.0.1]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.0.1
[2.0.0]: https://github.com/guilbep/vite-ssr-nunjucks-i18n-basic/releases/tag/v2.0.0
