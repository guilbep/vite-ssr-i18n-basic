import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { minify } from "html-minifier-terser";
import { Eta } from "eta";
import {
  getRoutePath,
  loadLocaleData,
  makeTranslator,
} from "../utils/locale-utils.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../templates", import.meta.url));

export class NotFoundGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || "dist";
    this.pagesDir = options.pagesDir || "src/pages";
    this.dataDir = options.dataDir || "src/data";
    this.locales = options.locales || ["en", "fr"];
    this.defaultLocale = options.defaultLocale || "en";
    this.localesMeta = options.localesMeta || {};
    this.userEta = options.eta; // User-site Eta for custom 404 overrides
    this.globals = options.globals || {}; // Template helpers for custom 404 renders
    this.isProduction = false;
    this.minifyHtml = options.minifyHtml ?? true;

    // Isolated Eta for the built-in default 404 template.
    this.eta = new Eta({
      views: TEMPLATES_DIR,
      useWith: true,
      autoEscape: true,
      cache: true,
    });
  }

  setProduction(isProduction) {
    this.isProduction = isProduction;
  }

  setEta(eta) {
    this.userEta = eta;
  }

  setGlobals(globals) {
    this.globals = globals;
  }

  setAssetHashes(assetHashes) {
    this.assetHashes = assetHashes;
  }

  // Generate localized 404 pages using routes
  async write404s(routesConfig) {
    for (const locale of this.locales) {
      const meta = this.localesMeta[locale] || {};

      // Try to use a 404 template if available, otherwise use default
      let html;
      const custom404Path = `${this.pagesDir}/404.eta`;
      const custom404LocalePath = `${this.pagesDir}/404.${locale}.eta`;

      if (existsSync(custom404LocalePath) || existsSync(custom404Path)) {
        html = await this.renderCustom404(
          locale,
          custom404Path,
          custom404LocalePath,
          routesConfig,
        );
      }

      // Fallback to basic 404 page
      if (!html) {
        html = this.generateBasic404(locale, meta, routesConfig);
      }

      if (this.isProduction && this.minifyHtml) {
        html = await minify(html, {
          removeComments: true,
          collapseWhitespace: true,
          minifyCSS: true,
          minifyJS: true,
        });
      }

      // Write 404 to the locale-specific directory structure from routes.
      // Use the first non-empty segment of the landing_page path (matches
      // webmanifest-generator). dirname("en/") returns "." which would
      // collapse all locales into dist/404.html — pathParts[0] is robust.
      const routes = routesConfig.routes || [];
      const indexRoute = routes.find((r) => r.key === "landing_page");
      let localeDir = locale;
      if (indexRoute) {
        const indexPath = getRoutePath("landing_page", locale, routesConfig);
        if (indexPath) {
          const pathParts = indexPath.split("/").filter((p) => p);
          localeDir = pathParts[0] || locale;
        }
      }

      const out = join(this.outputDir, localeDir, "404.html");
      if (!existsSync(dirname(out)))
        mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, html);
      console.log(`  ✓ ${localeDir}/404.html`);
    }
  }

  async renderCustom404(
    locale,
    custom404Path,
    custom404LocalePath,
    routesConfig,
  ) {
    if (!this.userEta) {
      console.warn("Eta environment not available for custom 404 rendering");
      return null;
    }

    try {
      const localeData = loadLocaleData(this.locales, this.dataDir);
      const translator = makeTranslator(localeData, locale, this.defaultLocale);

      const templateFile = existsSync(custom404LocalePath)
        ? "404." + locale + ".eta"
        : "404.eta";
      const html = this.userEta.render("pages/" + templateFile, {
        ...this.globals,
        locale,
        locales: this.locales,
        alternates: [locale], // Only current locale for 404
        defaultLocale: this.defaultLocale,
        rtl:
          this.localesMeta[locale]?.rtl ||
          ["ar", "he", "fa", "ur"].includes(locale),
        t: translator,
        ...Object.fromEntries(
          Object.entries(
            localeData[locale] || localeData[this.defaultLocale] || {},
          ),
        ),
        currentPage: "/404.html",
        page: { slug: "404" },
        isCurrentLocale: (l) => l === locale,
        getLocalizedUrl: (pageKeyOrPath, targetLocale = locale) => {
          const targetRoute = getRoutePath(
            pageKeyOrPath,
            targetLocale,
            routesConfig,
          );
          if (targetRoute) return targetRoute;

          const cleanPath = pageKeyOrPath.replace(/^\/([a-z]{2})\//, "");
          return `/${targetLocale}/${cleanPath.startsWith("/") ? cleanPath.slice(1) : cleanPath}`;
        },
        getRouteUrl: (pageKey, targetLocale = locale) => {
          return getRoutePath(pageKey, targetLocale, routesConfig) || "#";
        },
      });

      return html;
    } catch (err) {
      console.warn(
        `Could not render 404 template for ${locale}, using default:`,
        err.message,
      );
      return null;
    }
  }

  generateBasic404(locale, meta, routesConfig) {
    const localeData = loadLocaleData(this.locales, this.dataDir);
    const translator = makeTranslator(localeData, locale, this.defaultLocale);

    // Build alternate URLs for all locales
    const alternateUrls = {};
    for (const altLocale of this.locales) {
      const altUrl =
        getRoutePath("404", altLocale, routesConfig) || `/${altLocale}/404`;
      alternateUrls[altLocale] = altUrl;
    }

    const canonicalUrl =
      getRoutePath("404", locale, routesConfig) || `/${locale}/404`;

    return this.eta.render("404.html.eta", {
      locale,
      locales: this.locales,
      defaultLocale: this.defaultLocale,
      title: translator("404.title") || "404 - Page Not Found",
      heading: translator("404.heading") || "404 - Page Not Found",
      description:
        translator("404.description") ||
        "The page you are looking for could not be found.",
      message:
        translator("404.message") ||
        "The page you are looking for could not be found.",
      canonicalUrl,
      alternateUrls,
      errorCode: "404",
      assetHashes: this.assetHashes,
    });
  }
}
