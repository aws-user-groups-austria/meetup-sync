/**
 * Text helpers: emoji stripping, markdown removal, slugs. Everything the page
 * says passes through here before it reaches event.json.
 */

const KEEP = new Set(["\u00A9", "\u00AE", "\u2122"]);
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\uFE0F\uFE0E\u200D\u20E3]/gu;

/** Long dashes (figure, en, em, horizontal bar) become a plain hyphen: the group writes "-" everywhere. */
export function plainDashes(input: string): string {
  return input.replace(/[\u2012\u2013\u2014\u2015]/g, "-");
}

/** Removes emoji (and their joiners and variation selectors) and long dashes, then tidies the spaces they leave. */
export function stripEmoji(input: string): string {
  return plainDashes(input)
    .replace(EMOJI, (ch) => (KEEP.has(ch) ? ch : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** A markdown link: [text](url). */
export const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Removes inline markdown (links, bold, italics, code, escapes, heading and list markers). */
export function stripMarkdown(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(LINK, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/(^|[\s(])\*(?=\S)/g, "$1")
    .replace(/(\S)\*(?=$|[\s).,:;!?])/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[*+-]\s+/gm, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

/** Markdown and emoji removed, whitespace collapsed to single spaces. */
export function plain(input: string): string {
  return stripEmoji(stripMarkdown(input)).replace(/\s+/g, " ").trim();
}

const QUOTE_OPEN = /^["\u201C\u201E\u00AB]/;
const QUOTE_CLOSE = /["\u201D\u201C\u00BB]$/;

/** True when the whole text is one quoted title, e.g. "I don't trust my agents!". */
export function isQuoted(text: string): boolean {
  const t = text.trim();
  return t.length > 2 && QUOTE_OPEN.test(t) && QUOTE_CLOSE.test(t);
}

/** Removes the surrounding quotes of a quoted title. */
export function unquote(text: string): string {
  const t = text.trim();
  return isQuoted(t) ? t.slice(1, -1).trim() : t;
}

/** Comparable form of a title: straight quotes, lower case, single spaces. */
export function normalizeTitle(text: string): string {
  return unquote(plain(text))
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** URL-safe slug: diacritics folded, lower case, runs of other characters become one hyphen. */
export function slugify(text: string): string {
  return text
    .replace(/\u00DF/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The main part of an event title, before a spaced separator:
 * "AWS Meetup Vienna #53 - hosted by RBI" becomes "AWS Meetup Vienna #53".
 */
export function mainTitle(title: string): string {
  const [head] = title.replace(/\s*[-\u2013\u2014|]\s*hosted\s+by\b.*$/i, "").split(/\s+[-\u2013\u2014|]\s+/);
  return (head ?? title).trim() || title.trim();
}
