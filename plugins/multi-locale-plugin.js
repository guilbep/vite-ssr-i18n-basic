/**
 * Multi-Locale Vite Plugin
 *
 * Static site generator with i18n support. Renders Eta templates into one
 * HTML file per page per locale, plus per-locale sitemaps, 404s, and
 * webmanifests.
 *
 * Utils:
 * - locale-utils.js: route/locale helpers, translator, link rewriter
 * - asset-processor.js: CSS/JS/image pipeline with cache-busting hashes
 * - page-renderer.js: per-locale page rendering
 *
 * Generators (using bundled .eta templates from plugins/templates/):
 * - sitemap-generator.js: per-locale sitemap.xml + sitemap-index.xml
 * - notfound-generator.js: per-locale 404.html
 * - webmanifest-generator.js: per-locale site.webmanifest
 * - root-redirect-generator.js: root index.html with language detection
 */

import { resolve, join, dirname, basename, extname, sep } from "path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
  copyFileSync,
} from "fs";
import { glob } from "glob";
import { Eta } from "eta";
import chokidar from "chokidar";

// Import refactored modules
import {
  AssetProcessor,
  OPTIMIZABLE_IMAGE_EXTENSIONS,
} from "./utils/asset-processor.js";
import { PageRenderer } from "./utils/page-renderer.js";
import { SitemapGenerator } from "./generators/sitemap-generator.js";
import { NotFoundGenerator } from "./generators/notfound-generator.js";
import { WebmanifestGenerator } from "./generators/webmanifest-generator.js";
import { RootRedirectGenerator } from "./generators/root-redirect-generator.js";
import { MarkdownRenderer } from "./utils/markdown.js";
import {
  parsePageFile,
  loadRoutesConfig,
  loadLocaleData,
  loadMetaData,
  getRoutePath,
} from "./utils/locale-utils.js";

export function multiLocalePlugin(options = {}) {
  const {
    srcDir = "src",
    pagesDir = "src/pages",
    layoutsDir = "src/layouts",
    partialsDir = "src/partials",
    dataDir = "src/data",
    outputDir = "dist",
    devOutputDir = ".tmp", // Separate directory for development
    defaultLocale = "en",
    locales = ["en", "fr"],
    siteUrl = "https://example.com",
    localesMeta = {},
    emitSitemaps = true,
    emit404s = true,
    emitWebmanifest = true,
    linkRewrite = "safety-net",
    copyPublic = true, // Option to disable public directory copying
    // A language-detection redirect at the site root only makes sense with
    // more than one locale; with one, it would overwrite a page routed to /.
    emitRootRedirect = locales.length > 1,
    minifyHtml = true,
    markdown = {}, // { layout, eta, extensions } for .md pages
  } = options;

  // Checked when a build or dev server starts, not when vite.config.js
  // loads, so a generator running earlier can still create pagesDir.
  function assertRequiredDirs() {
    const requiredDirs = [srcDir, pagesDir, layoutsDir, partialsDir, dataDir];
    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        throw new Error(
          `Required directory "${dir}" does not exist. Please create it or adjust your plugin configuration.`,
        );
      }
    }
  }

  // Validate locales configuration
  if (!Array.isArray(locales) || locales.length === 0) {
    throw new Error("locales must be a non-empty array");
  }

  if (!locales.includes(defaultLocale)) {
    throw new Error(
      `defaultLocale "${defaultLocale}" must be included in locales array`,
    );
  }

  let isServing = false;
  let server = null;
  let isProduction = false;
  let currentOutputDir = outputDir; // Will be set based on mode

  // Initialize component modules with correct output directory
  const assetProcessor = new AssetProcessor({
    srcDir,
    outputDir: isProduction ? outputDir : devOutputDir, // Use correct directory based on mode
    copyPublic,
  });

  const pageRenderer = new PageRenderer({
    outputDir: currentOutputDir,
    pagesDir,
    dataDir,
    locales,
    defaultLocale,
    localesMeta,
    linkRewrite,
    minifyHtml,
  });

  const sitemapGenerator = new SitemapGenerator({
    outputDir: currentOutputDir,
    siteUrl,
    locales,
  });

  const notFoundGenerator = new NotFoundGenerator({
    outputDir: currentOutputDir,
    pagesDir,
    dataDir,
    locales,
    defaultLocale,
    localesMeta,
    minifyHtml,
  });

  const webmanifestGenerator = new WebmanifestGenerator({
    outputDir: currentOutputDir,
    locales,
    defaultLocale,
    localesMeta,
  });

  const rootRedirectGenerator = new RootRedirectGenerator({
    outputDir: currentOutputDir,
    locales,
    defaultLocale,
    minifyHtml,
  });

  // Track file modification times for incremental rebuilds
  const fileMTime = new Map();

  // Cleanup function for development
  function cleanupDevDirectory() {
    if (!isProduction && existsSync(devOutputDir)) {
      try {
        rmSync(devOutputDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up ${devOutputDir} directory`);
      } catch (error) {
        console.warn(`⚠️  Could not clean up ${devOutputDir}:`, error.message);
      }
    }
  }

  // Setup cleanup on process exit
  function setupCleanup() {
    const cleanup = () => {
      cleanupDevDirectory();
      process.exit(0);
    };

    // Handle various exit signals
    process.on("SIGINT", cleanup); // Ctrl+C
    process.on("SIGTERM", cleanup); // Termination signal
    process.on("exit", cleanupDevDirectory); // Process exit
  }

  // Configure Eta. Single `views` root (srcDir) so templates can reference
  // partials/layouts/pages with absolute paths like `/partials/head`,
  // `/layouts/main`. autoEscape on by default; templates use `<%~` to
  // explicitly opt into raw (unescaped) output. cache off in dev so the
  // watcher needs no per-file invalidation; configResolved turns it on for
  // production builds.
  const eta = new Eta({
    views: srcDir,
    useWith: true,
    autoEscape: true,
    cache: false,
  });

  // Helpers exposed to every template render. With useWith: true, these are
  // available as bare identifiers inside templates (e.g. `<%= t('foo') %>`,
  // `<%~ inline_asset('/x.css') %>`). Helpers that need plugin state
  // (manifest, currentOutputDir) close over it here; helpers that need
  // per-render state (t) are added on top of these in page-renderer.
  const manifest = assetProcessor.getManifest();

  const MIME_TYPES = {
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  const globals = {
    asset: (logicalPath) => manifest[logicalPath] || logicalPath,
    manifest,

    // Inline a processed (minified, hashed) asset directly into the document
    // — useful for critical CSS, tiny JS shims. Use with `<%~` in templates.
    inline_asset: (logicalPath) => {
      const physical = manifest[logicalPath] || logicalPath;
      const fsPath = join(currentOutputDir, physical.replace(/^\//, ""));
      try {
        return readFileSync(fsPath, "utf8");
      } catch (err) {
        console.warn(`inline_asset: could not read ${fsPath}: ${err.message}`);
        return "";
      }
    },

    // Inline an asset as a data: URI — embeds small images so the LCP
    // arrives in the first network round-trip alongside the document. SVG
    // is URL-encoded (smaller than base64), everything else is base64.
    // Use with `<%~` in templates.
    data_uri: (logicalPath) => {
      const physical = manifest[logicalPath] || logicalPath;
      const fsPath = join(currentOutputDir, physical.replace(/^\//, ""));
      try {
        const buf = readFileSync(fsPath);
        const ext = extname(fsPath).toLowerCase();
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        if (ext === ".svg") {
          const encoded = encodeURIComponent(buf.toString("utf-8"))
            .replace(/'/g, "%27")
            .replace(/"/g, "%22");
          return `data:${mime};utf8,${encoded}`;
        }
        return `data:${mime};base64,${buf.toString("base64")}`;
      } catch (err) {
        console.warn(`data_uri: could not read ${fsPath}: ${err.message}`);
        return "";
      }
    },

    // Eleventy-style URL helpers — now plain functions instead of filters,
    // called as `<%= url('foo') %>`, `<%= absoluteUrl(currentPage, base) %>`.
    locale_url: (p, l) => `/${l}${p.startsWith("/") ? "" : "/"}${p}`,
    eq: (a, b) => a === b,
    url: (p) => {
      if (!p) return "/";
      if (p.startsWith("http") || p.startsWith("/")) return p;
      return "/" + p;
    },
    absoluteUrl: (path, baseUrl) => {
      if (!path) return baseUrl || "";
      if (!baseUrl) return path;
      if (path.startsWith("http")) return path;
      const cleanBase = baseUrl.replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path : "/" + path;
      return cleanBase + cleanPath;
    },
  };

  // Hand the Eta instance + globals to components that render templates.
  pageRenderer.setEta(eta);
  pageRenderer.setGlobals(globals);
  // The optional Eta pass over .md source gets its own instance with
  // autoTrim off: a tag at a line end must keep the newline Markdown needs.
  pageRenderer.setMarkdown(
    new MarkdownRenderer({
      ...markdown,
      etaPass: new Eta({
        views: srcDir,
        useWith: true,
        autoEscape: true,
        cache: false,
        autoTrim: false,
      }),
    }),
  );
  notFoundGenerator.setEta(eta);
  notFoundGenerator.setGlobals(globals);

  // Check if file is stale for incremental rebuilds
  function isStale(file) {
    if (!existsSync(file)) return false;
    const m = statSync(file).mtimeMs;
    const prev = fileMTime.get(file);
    fileMTime.set(file, m);
    return prev !== m;
  }

  // Pages are .eta templates or .md files, with co-located locale variants:
  // page key => { default: "about.md", variants: { fr: "about.fr.md" } }.
  function discoverPages() {
    const byKey = new Map();
    for (const f of glob.sync(`${pagesDir}/**/*.{eta,md}`).sort()) {
      const rel = f.replace(`${pagesDir}/`, "");
      const { key, locale } = parsePageFile(rel, locales);
      const entry = byKey.get(key) || { default: null, variants: {} };
      const taken = locale ? entry.variants[locale] : entry.default;
      if (taken) {
        throw new Error(`Both ${taken} and ${rel} define page "${key}"`);
      }
      if (locale) entry.variants[locale] = rel;
      else entry.default = rel;
      byKey.set(key, entry);
    }
    return byKey;
  }

  // routes.config.json, plus a route for each .md page it doesn't list:
  // `index` → `/`, `guide/setup` → `/guide/setup`. Listed routes win, so a
  // Markdown page can still get localized paths and titles there.
  function loadRoutes(pages = discoverPages()) {
    const config = loadRoutesConfig(locales);
    const routes = Array.isArray(config.routes) ? [...config.routes] : [];
    const listed = new Set(routes.map((r) => r.key));
    for (const [key, entry] of pages) {
      const file = entry.default || Object.values(entry.variants)[0];
      if (listed.has(key) || !file.endsWith(".md")) continue;
      const path = key === "index" ? "/" : `/${key}`;
      routes.push({ key, path, title: key, hidden: true });
    }
    return { ...config, routes };
  }

  // Images next to pages, copied as-is to where a page at the same relative
  // path lands: `img/a.png` → `<out><basePath>/img/a.png` for each locale.
  const PAGE_ASSET_GLOB = `**/*.{${OPTIMIZABLE_IMAGE_EXTENSIONS.map((e) => e.slice(1)).join(",")}}`;
  function copyPageAssets(routesConfig) {
    for (const rel of glob.sync(PAGE_ASSET_GLOB, {
      cwd: pagesDir,
      nocase: true,
    })) {
      for (const locale of locales) {
        const dest = join(currentOutputDir, routesConfig.basePath[locale], rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(pagesDir, rel), dest);
      }
    }
  }

  // Generate all pages for all locales
  async function generatePages() {
    const localeData = loadLocaleData(locales, dataDir);
    const byBase = discoverPages();
    const routesConfig = loadRoutes(byBase);
    const metaData = loadMetaData(dataDir);

    console.log(`🌍 Generating pages for locales: ${locales.join(", ")}`);

    // Update all components with current state
    const assetHashes = assetProcessor.getAssetHashes();
    pageRenderer.setAssetHashes(assetHashes);
    notFoundGenerator.setAssetHashes(assetHashes);

    // Render pages
    for (const [pageKey, entry] of byBase) {
      for (const locale of locales) {
        const relTemplate = entry.variants[locale] || entry.default; // fallback
        if (!relTemplate) continue; // no default: skip
        await pageRenderer.renderOne({
          relTemplate,
          pageKey,
          locale,
          availableLocales: Object.keys(entry.variants),
          localeData,
          routesConfig,
          metaData,
        });
      }
    }
    copyPageAssets(routesConfig);

    if (emitRootRedirect) {
      await rootRedirectGenerator.generateRootRedirect(routesConfig);
    }

    // Generate sitemaps if enabled
    if (emitSitemaps) {
      sitemapGenerator.buildSitemaps(routesConfig);
    }

    // Generate 404 pages if enabled
    if (emit404s) {
      await notFoundGenerator.write404s(routesConfig);
    }

    // Generate localized webmanifests if enabled
    if (emitWebmanifest) {
      await webmanifestGenerator.generateWebManifests(routesConfig, localeData);
    }
  }

  // Setup file watcher for development with incremental rebuilds
  function setupWatcher() {
    const watchPaths = [
      // Pages (Eta templates and Markdown), the images next to them, and
      // Eta layouts/partials
      `${pagesDir}/**/*.{eta,md}`,
      `${pagesDir}/${PAGE_ASSET_GLOB}`,
      `${layoutsDir}/**/*.eta`,
      `${partialsDir}/**/*.eta`,
      // Data files
      `${dataDir}/**/*.json`,
      // CSS files
      `${srcDir}/assets/css/**/*.css`,
      // JS files
      `${srcDir}/assets/js/**/*.js`,
      // Asset files that might affect the build
      `${srcDir}/assets/**/*`,
    ];

    const watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("change", async (path) => {
      if (!isStale(path)) return;

      console.log(`📝 File changed: ${path}`);

      // Determine file type and appropriate action
      const ext = extname(path).toLowerCase();
      const isTemplate = ext === ".eta" || ext === ".md";
      const isData = ext === ".json" && path.startsWith(dataDir);
      const isAsset =
        ext === ".css" ||
        ext === ".js" ||
        path.startsWith(`${srcDir}/assets`) ||
        path.startsWith("public/");

      // For assets, reprocess them first
      if (isAsset) {
        console.log(`🎨 Reprocessing assets due to ${ext} file change...`);
        await assetProcessor.processAssets();
      }

      const localeData = loadLocaleData(locales, dataDir);
      const metaData = loadMetaData(dataDir);

      // For templates and data files, handle page rebuilding
      if (isTemplate || isData) {
        const byBase = discoverPages();
        const routesConfig = loadRoutes(byBase);

        // If a page changed: rebuild that page for all locales
        if (path.startsWith(pagesDir)) {
          const rel = path.replace(`${pagesDir}/`, "");
          const { key } = parsePageFile(rel, locales);
          await pageRenderer.rebuildBase(
            key,
            localeData,
            routesConfig,
            metaData,
            byBase,
          );
        } else {
          // layout/partials/data: rebuild all pages
          await generatePages();
        }
      } else if (isAsset) {
        // For assets, we need to update asset hashes and regenerate pages with new hashes
        const assetHashes = assetProcessor.getAssetHashes();
        pageRenderer.setAssetHashes(assetHashes);
        notFoundGenerator.setAssetHashes(assetHashes);

        // Regenerate all pages to pick up new asset hashes
        await generatePages();
      } else if (path.startsWith(pagesDir)) {
        // An image next to the pages: refresh its copies
        copyPageAssets(loadRoutes());
      }

      // Trigger HMR if in dev mode
      if (server) {
        server.ws.send({ type: "full-reload" });
      }
    });

    watcher.on("add", async (path) => {
      console.log(`➕ File added: ${path}`);

      // Determine file type and appropriate action
      const ext = extname(path).toLowerCase();
      const isAsset =
        ext === ".css" ||
        ext === ".js" ||
        path.startsWith(`${srcDir}/assets`) ||
        path.startsWith("public/");

      // For assets, reprocess them first
      if (isAsset) {
        console.log(`🎨 Processing new asset: ${ext} file...`);
        await assetProcessor.processAssets();
      }

      // Always regenerate pages when files are added to ensure proper integration
      await generatePages();

      // Trigger HMR if in dev mode
      if (server) {
        server.ws.send({ type: "full-reload" });
      }
    });

    watcher.on("unlink", async (path) => {
      console.log(`🗑️  File deleted: ${path}`);

      // Determine file type and appropriate action
      const ext = extname(path).toLowerCase();
      const isAsset =
        ext === ".css" ||
        ext === ".js" ||
        path.startsWith(`${srcDir}/assets`) ||
        path.startsWith("public/");

      // For assets, reprocess them to update references
      if (isAsset) {
        console.log(`🎨 Reprocessing assets after deletion of ${ext} file...`);
        await assetProcessor.processAssets();
      }

      // Always regenerate pages when files are deleted to ensure cleanup
      await generatePages();

      // Trigger HMR if in dev mode
      if (server) {
        server.ws.send({ type: "full-reload" });
      }
    });

    return watcher;
  }

  // Locale routing and asset serving, shared by the dev and preview
  // servers so a routing change cannot miss one of them.
  // A request path mapped to an existing file inside the output dir; null
  // when it can't be decoded or resolves anywhere else, so the request
  // falls through instead of reading arbitrary files.
  function outputFile(urlPath) {
    const root = resolve(currentOutputDir);
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    const file = resolve(root, `.${decoded}`);
    return file.startsWith(root + sep) && existsSync(file) ? file : null;
  }

  function routeMiddleware(req, res, next) {
    const url = req.url;

    // Serve shared assets from /assets/ - prevent locale prefixing
    if (url.startsWith("/assets/")) {
      const assetPath = outputFile(url);
      if (assetPath) {
        const content = readFileSync(assetPath);
        const ext = extname(assetPath);
        const mimeTypes = {
          ".css": "text/css",
          ".js": "text/javascript",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
        };
        res.setHeader("Content-Type", mimeTypes[ext] || "text/plain");
        res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year cache
        res.end(content);
        return;
      }
    }

    // Images copied next to the pages sit under a locale's basePath,
    // possibly "": serve them before the locale fallback claims them.
    const urlPath = url.split("?")[0];
    const ext = extname(urlPath).toLowerCase();
    if (OPTIMIZABLE_IMAGE_EXTENSIONS.includes(ext)) {
      const file = outputFile(urlPath);
      if (file) {
        res.setHeader("Content-Type", MIME_TYPES[ext]);
        res.end(readFileSync(file));
        return;
      }
    }

    // If requesting root, serve the redirect page
    if (url === "/" || url === "/index.html") {
      const redirectHtml = readFileSync(
        `${currentOutputDir}/index.html`,
        "utf8",
      );
      res.setHeader("Content-Type", "text/html");
      res.end(redirectHtml);
      return;
    }

    // Load routes configuration for URL matching
    const routesConfig = loadRoutes();
    const routesList = routesConfig.routes || [];

    // Try to match the URL to a route in any locale
    for (const locale of locales) {
      for (const route of routesList) {
        // Get the actual path for this locale
        const routePath = getRoutePath(route.key, locale, routesConfig);
        if (!routePath) continue;

        // Check if URL matches this route (with or without trailing slash)
        const cleanRoutePath = routePath.replace(/\/$/, "");
        const cleanUrlPath = url.replace(/\/$/, "");

        // Pages are emitted as .html, and links to them say so
        if (
          cleanRoutePath === cleanUrlPath ||
          `${cleanRoutePath}.html` === cleanUrlPath
        ) {
          // Convert route path to file path using same logic as renderOne
          let filePath = routePath.replace(/^\//, "").replace(/\/$/, "");
          if (!filePath) filePath = "index";

          // For index routes, place them in the locale directory structure
          if (locales.includes(filePath)) {
            filePath = filePath + "/index";
          }

          if (!filePath.endsWith(".html")) filePath += ".html";

          const fullPath = join(currentOutputDir, filePath);
          if (existsSync(fullPath)) {
            const html = readFileSync(fullPath, "utf8");
            res.setHeader("Content-Type", "text/html");
            res.end(html);
            return;
          }
        }

        // Also check if URL matches route path without .html extension
        if (!url.endsWith(".html")) {
          const urlWithHtml = url + ".html";
          if (cleanRoutePath === urlWithHtml.replace(/\/$/, "")) {
            // Convert route path to file path using same logic as renderOne
            let filePath = routePath.replace(/^\//, "").replace(/\/$/, "");
            if (!filePath) filePath = "index";

            // For index routes, place them in the locale directory structure
            if (locales.includes(filePath)) {
              filePath = filePath + "/index";
            }

            if (!filePath.endsWith(".html")) filePath += ".html";

            const fullPath = join(currentOutputDir, filePath);
            if (existsSync(fullPath)) {
              const html = readFileSync(fullPath, "utf8");
              res.setHeader("Content-Type", "text/html");
              res.end(html);
              return;
            }
          }
        }
      }
    }

    // Legacy fallback: If requesting a locale-specific page with old structure
    const localeMatch = url.match(/^\/([a-z]{2})\/(.*)/);
    if (localeMatch) {
      const [, locale, path] = localeMatch;
      if (locales.includes(locale)) {
        const filePath = outputFile(`/${locale}/${path || "index.html"}`);
        if (filePath) {
          const html = readFileSync(filePath, "utf8");
          res.setHeader("Content-Type", "text/html");
          res.end(html);
          return;
        }
      }
    }

    next();
  }

  return {
    name: "multi-locale",

    configResolved(config) {
      // Detect production mode using config.mode
      // In Vite:
      // - dev: command='serve', mode='development'
      // - preview: command='serve', mode='production'
      // - build: command='build', mode='production'
      isProduction = config.mode === "production";
      // Without it every include() re-reads and recompiles its partial on
      // every page: a nav partial cost ~0.1 s per build on 387 pages.
      eta.configure({ cache: isProduction });

      // Set output directory based on mode
      currentOutputDir = isProduction ? outputDir : devOutputDir;

      // Update all components with the correct output directory
      assetProcessor.outputDir = currentOutputDir;
      pageRenderer.outputDir = currentOutputDir;
      sitemapGenerator.outputDir = currentOutputDir;
      notFoundGenerator.outputDir = currentOutputDir;
      webmanifestGenerator.outputDir = currentOutputDir;
      rootRedirectGenerator.outputDir = currentOutputDir;

      // Update production state in all components
      assetProcessor.setProduction(isProduction);
      pageRenderer.setProduction(isProduction);
      notFoundGenerator.setProduction(isProduction);
      rootRedirectGenerator.setProduction(isProduction);

      console.log(
        `📁 Using output directory: ${currentOutputDir} (${isProduction ? "production" : "development"})`,
      );

      // Update paths based on Vite config
      if (config.root) {
        // Adjust paths to be relative to Vite root
      }
    },

    configureServer(devServer) {
      isServing = true;
      server = devServer;
      assertRequiredDirs();

      // Setup cleanup for development mode
      if (!isProduction) {
        setupCleanup();
      }

      // Generate initial pages and assets (async)
      (async () => {
        await assetProcessor.processAssets();
        await generatePages();
      })().catch(console.error);

      // Setup file watcher
      const watcher = setupWatcher();

      // Cleanup on server close
      devServer.httpServer?.on("close", () => {
        watcher.close();
        cleanupDevDirectory();
      });

      // Add HMR middleware to inject Vite client script into HTML responses
      devServer.middlewares.use((req, res, next) => {
        // Store original res.end to intercept HTML responses
        const originalEnd = res.end.bind(res);

        res.end = function (chunk, encoding) {
          // Only process HTML content in development
          if (
            !isProduction &&
            res.getHeader("Content-Type")?.includes("text/html") &&
            chunk &&
            typeof chunk === "string"
          ) {
            // Inject Vite client script if not already present
            if (!chunk.includes("/@vite/client")) {
              chunk = chunk.replace(
                /<head>/i,
                '<head>\n  <script type="module" src="/@vite/client"></script>',
              );
            }
          }

          originalEnd(chunk, encoding);
        };

        next();
      });

      // Custom middleware for locale routing and asset serving
      devServer.middlewares.use(routeMiddleware);
    },

    configurePreviewServer(previewServer) {
      previewServer.middlewares.use(routeMiddleware);
    },

    async buildStart() {
      if (!isServing) {
        assertRequiredDirs();
        console.log("🏗️  Building multi-locale site...");
        // Ensure output directory exists and is clean
        if (!existsSync(currentOutputDir)) {
          mkdirSync(currentOutputDir, { recursive: true });
        }
        // Process assets for both dev and production
        await assetProcessor.processAssets();
        await generatePages();
      }
    },

    generateBundle(options, bundle) {
      // Clear the bundle since we don't need JS files for this static site
      for (const fileName of Object.keys(bundle)) {
        delete bundle[fileName];
      }
      console.log("📦 Multi-locale pages generated");
    },

    // Hook into the writeBundle to ensure our static files are copied to final output
    async writeBundle() {
      if (isProduction) {
        console.log("✅ Multi-locale build complete!");
      }
    },
  };
}

// Export a helper function to create the plugin with common defaults
export function createMultiLocalePlugin(userOptions = {}) {
  return multiLocalePlugin(userOptions);
}
