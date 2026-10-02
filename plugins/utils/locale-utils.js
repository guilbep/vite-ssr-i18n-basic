import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

// Locale regex for co-located variants
export const LOCALE_RE = /\.([a-z]{2})\.eta$/;

// Helper function to get route path for a page key and locale
export function getRoutePath(pageKey, locale, routesConfig) {
  const routes = routesConfig.routes || [];
  const route = routes.find((r) => r.key === pageKey);

  if (!route) return null;

  // Handle path - could be string or object with locale keys
  if (typeof route.path === "string") {
    // Use default path for all locales
    return `${routesConfig.basePath[locale]}${route.path}`;
  } else if (typeof route.path === "object" && route.path[locale]) {
    // Use locale-specific path
    return `${routesConfig.basePath[locale]}${route.path[locale]}`;
  }

  return null;
}

// Helper function to get page key from filename
export function getPageKey(filename) {
  // Remove extension and locale suffix
  const base = filename.replace(/\.(eta|md)$/, "").replace(/\.[a-z]{2}$/, "");
  return base;
}

// Page file (relative to pagesDir) → page key and locale variant.
// `about.fr.md` is the `fr` variant of `about` only when `fr` is a
// configured locale; otherwise `about.fr` is a page key of its own.
export function parsePageFile(rel, locales) {
  const stem = rel.replace(/\.(eta|md)$/, "");
  const match = stem.match(/\.([a-z]{2})$/);
  const locale = match && locales.includes(match[1]) ? match[1] : null;
  return { key: locale ? stem.slice(0, -3) : stem, locale };
}

// Helper function to get all route paths for a page key across all locales
export function getAllRoutePaths(pageKey, routesConfig) {
  const paths = {};
  const routes = routesConfig.routes || [];
  const locales = routesConfig.locales || [];

  const route = routes.find((r) => r.key === pageKey);
  if (!route) return paths;

  // Handle path - could be string or object with locale keys
  if (typeof route.path === "string") {
    // Use default path for all locales
    for (const locale of locales) {
      paths[locale] = `${routesConfig.basePath[locale]}${route.path}`;
    }
  } else if (typeof route.path === "object") {
    // Use locale-specific paths
    for (const locale of locales) {
      if (route.path[locale]) {
        paths[locale] = `${routesConfig.basePath[locale]}${route.path[locale]}`;
      }
    }
  }

  return paths;
}

// Load routes configuration. Every page path starts from basePath[locale],
// so a missing file or locale entry fails here, not as an undefined/... path.
export function loadRoutesConfig(locales) {
  const file = resolve("routes.config.json");
  let config;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot load ${file}: ${err.message}`, { cause: err });
  }
  for (const locale of locales) {
    if (typeof config.basePath?.[locale] !== "string") {
      throw new Error(`${file}: basePath has no entry for locale "${locale}"`);
    }
  }
  return config;
}

// Load locale data
export function loadLocaleData(locales, dataDir) {
  const localeData = {};
  for (const locale of locales) {
    try {
      const data = JSON.parse(
        readFileSync(`${dataDir}/${locale}.json`, "utf8"),
      );
      localeData[locale] = data;
    } catch (err) {
      console.warn(`Could not load locale data for ${locale}:`, err.message);
      localeData[locale] = {};
    }
  }
  return localeData;
}

// Load meta data
export function loadMetaData(dataDir) {
  try {
    const metaData = JSON.parse(readFileSync(`${dataDir}/meta.json`, "utf8"));
    return metaData;
  } catch (err) {
    console.warn("Could not load meta.json:", err.message);
    return {};
  }
}

// Helper function to get nested object values
export function getNestedValue(obj, path) {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

// Helper function to get route property with locale fallback
export function getRouteProperty(route, property, locale) {
  const value = route[property];

  // If it's a primitive value, use it as default
  if (typeof value !== "object" || value === null) {
    return value;
  }

  // If it's an object, look for locale-specific value
  if (value[locale] !== undefined) {
    return value[locale];
  }

  // Fall back to default if available
  if (value.default !== undefined) {
    return value.default;
  }

  // No locale-specific or default value found
  return undefined;
}

// Create real t() function with fallback and params - now supports nested keys
export function makeTranslator(localeData, locale, defaultLocale) {
  const L = localeData[locale] || {};
  const D = localeData[defaultLocale] || {};

  return (key, params = {}) => {
    // Support nested keys like "homepage.title"
    let s = getNestedValue(L, key) ?? getNestedValue(D, key) ?? key;

    // Handle parameter interpolation
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{{${k}}}`, String(v));
    }
    return s;
  };
}

// Generate content hash for cache busting
export function generateHash(content) {
  return createHash("md5").update(content).digest("hex").slice(0, 8);
}

// Rewrite root-relative links to be locale-aware using routes configuration
export function rewriteLinksWithRoutes(
  html,
  locale,
  routesConfig,
  linkRewrite,
) {
  if (linkRewrite === "off") return html;

  // First, try to match page keys in links and convert them to proper routes
  return html
    .replace(/href="([^"]*?)"/g, (match, href) => {
      // Skip external links, anchors, mailto, tel, and assets
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("/assets/")
      ) {
        return match;
      }

      // If it's already a properly formatted route path, leave it. An empty
      // basePath ("") would match every href, so it never counts here.
      const prefixes = Object.values(routesConfig.basePath || {}).filter(
        Boolean,
      );
      if (prefixes.some((p) => href === p || href.startsWith(`${p}/`))) {
        return match;
      }

      // Try to parse as page key (e.g., "about", "contact")
      const pageKey = href.replace(/^\//, "").replace(/\.html$/, "");
      const routePath = getRoutePath(pageKey, locale, routesConfig);

      if (routePath) {
        return `href="${routePath}"`;
      }

      // Fallback to original behavior for unknown links
      const cleanHref = href.replace(/^\/+/, "");
      return `href="/${locale}/${cleanHref}"`;
    })
    .replace(/src="([^"]*?)"/g, (match, src) => {
      // Handle src attributes (images, scripts, etc.)
      if (
        src.startsWith("http") ||
        src.startsWith("/assets/") ||
        src.startsWith("data:")
      ) {
        return match;
      }

      const cleanSrc = src.replace(/^\/+/, "");
      return `src="/${locale}/${cleanSrc}"`;
    });
}
