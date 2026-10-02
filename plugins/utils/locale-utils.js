import { readFileSync } from "fs";
import { createHash } from "crypto";

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
  const base = filename.replace(/\.eta$/, "").replace(/\.[a-z]{2}$/, "");
  return base;
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

// Load routes configuration
export function loadRoutesConfig() {
  try {
    const routesData = JSON.parse(readFileSync("routes.config.json", "utf8"));
    return routesData;
  } catch (err) {
    console.warn("Could not load routes.config.json:", err.message);
    return { routes: {} };
  }
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
