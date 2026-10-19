/**
 * Who hosted a meetup: from "hosted by X" in the title, else from the
 * description ("This event is sponsored by SQUER", "thank you to DoIT for hosting").
 */
import { plain } from "./text.ts";

/** "AWS Meetup #46 & Workshop - hosted by ByteSource" -> ["ByteSource"]; "x & y" gives both. */
export function hostsFromTitle(title: string): string[] {
  const m = /(?:hosted|sponsored)\s+by\s+(.+)$/i.exec(title);
  if (!m) return [];
  return m[1]!
    .split(/\s*(?:&|,|\band\b|\bund\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A company name as the website's logo map knows it: no legal-form suffix. */
export function cleanHost(name: string): string {
  return plain(name)
    .replace(/\s+(?:GmbH\s*&\s*Co\.?\s*KG|GmbH|AG|KG|e\.?\s?V\.?|Ltd\.?|Inc\.?)$/i, "")
    .replace(/[.!,;:]+$/, "")
    .trim();
}

const NAME = String.raw`\**\s*(?:\[([^\]]+)\]\([^)]*\)|([^*\n.!,(]+))\s*\**`;
const HOST_PATTERNS = [
  new RegExp(String.raw`(?:hosted\s+and\s+sponsored|sponsored\s+and\s+hosted|sponsored|hosted)\s+by\s*:?\s*\**\s*:?\s*${NAME}(?=[\s.!,(]|$)`, "i"),
  new RegExp(String.raw`thank(?:s|\s+you)?\s+(?:to\s+)?${NAME}\s+for\s+(?:sponsoring|hosting|supporting)`, "i"),
  new RegExp(String.raw`to\s+the\s+sponsor\s+${NAME}(?=[\s.!,(]|$)`, "i"),
];

/**
 * Who hosted, from the description when the title does not say: "This event
 * is sponsored by SQUER", "hosted and sponsored by **[Raiffeisen Informatik GmbH & Co KG](...)**",
 * "A huge thank you to **DoIT** for sponsoring". The user groups themselves are not hosts.
 */
export function hostsFromDescription(markdown: string): string[] {
  for (const line of markdown.split("\n")) {
    for (const re of HOST_PATTERNS) {
      const m = re.exec(line);
      const name = m ? cleanHost(m[1] ?? m[2] ?? "") : "";
      if (name && name.split(/\s+/).length <= 6 && !/^(the\s+)?aws\b|^(us|you|our|the community)\b|user group/i.test(name)) return [name];
    }
  }
  return [];
}

