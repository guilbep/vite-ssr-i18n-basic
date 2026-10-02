// markdown.js — render `.md` pages: frontmatter, optional Eta pass, marked,
// then the layout. Pages render straight from source, so the dev watcher
// on pagesDir reloads them like `.eta` pages.
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { Marked } from "marked";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// GitHub-style heading slug from the heading's HTML: drop tags, entities
// and punctuation, lowercase, one dash per space.
export function slugify(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

// Split `---` YAML frontmatter from the Markdown body.
export function parseFrontmatter(source) {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: source };
  return {
    frontmatter: load(match[1]) ?? {},
    body: source.slice(match[0].length),
  };
}

export class MarkdownRenderer {
  constructor(options = {}) {
    this.layout = options.layout || "/layouts/main";
    this.eta = options.eta ?? false; // run Eta over the source first
    this.etaPass = options.etaPass; // Eta instance for that pass
    this.ids = new Set(); // heading ids already used on the current page

    const ids = this.ids;
    this.marked = new Marked({ gfm: true });
    // Built-ins first: extensions registered after them take precedence.
    this.marked.use({
      renderer: {
        heading({ tokens, depth }) {
          const inner = this.parser.parseInline(tokens);
          const base = slugify(inner) || "section";
          let id = base;
          for (let n = 1; ids.has(id); n++) id = `${base}-${n}`;
          ids.add(id);
          return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
        },
      },
      walkTokens(token) {
        // `other.md#x` → `other.html#x`: pages are emitted as .html.
        if (token.type !== "link" || /^([a-z]+:|#|\/\/)/i.test(token.href)) {
          return;
        }
        token.href = token.href.replace(/\.md(#|\?|$)/, ".html$1");
      },
    });
    this.marked.use(...(options.extensions || []));
  }

  // Page HTML for one `.md` file. `data` is what `.eta` pages get; `eta`
  // renders the layout.
  render(file, data, eta) {
    const { frontmatter, body } = parseFrontmatter(readFileSync(file, "utf8"));
    const source =
      (frontmatter.eta ?? this.eta)
        ? this.etaPass.renderString(body, data)
        : body;
    this.ids.clear();
    const content = this.marked.parse(source);
    const h1 = source.match(/^#\s+(.+)$/m);
    return eta.render(frontmatter.layout || this.layout, {
      ...data,
      frontmatter,
      title: frontmatter.title ?? (h1 ? h1[1].trim() : data.page.key),
      body: content,
    });
  }
}
