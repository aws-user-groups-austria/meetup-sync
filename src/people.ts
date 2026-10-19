/**
 * People the group knows, shared by every meetup, by name: the name in lower
 * case with hyphens and no accents ("roman-jokel", "darko-mesaros").
 *
 *   meetup-event-vienna/people/<name>.png (or .jpg, .webp)  the photo
 *   meetup-event-vienna/people/<name>.json                  { "bio": "...", "links": [{ "title", "url" }] }
 *
 * A speaker without a photo whose file is there gets "people/<file>"; a speaker
 * without a bio gets the file's bio, and its links are added to the speaker's
 * (the description's LinkedIn link stays first). The JSON is for people who are
 * not on Sessionize. Runs before Sessionize, so the group's own pictures and
 * texts win; overrides still win over both.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuiltEvent } from "./build.ts";
import { slugify } from "./text.ts";

type Profile = { bio?: string; links?: { title: string; url: string }[] };

function readProfile(file: string): Profile {
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const bio = typeof data.bio === "string" && data.bio.trim() ? data.bio.trim() : undefined;
  const links = Array.isArray(data.links)
    ? data.links.filter(
        (l): l is { title: string; url: string } =>
          typeof l?.title === "string" && l.title.trim() !== "" && typeof l?.url === "string" && /^https:\/\//.test(l.url),
      )
    : [];
  return { ...(bio ? { bio } : {}), ...(links.length ? { links } : {}) };
}

const sameUrl = (a: string, b: string) => a.replace(/\/$/, "").toLowerCase() === b.replace(/\/$/, "").toLowerCase();

export function applyPeople(event: BuiltEvent, peopleDir: string): BuiltEvent {
  if (!existsSync(peopleDir)) return event;
  const files = readdirSync(peopleDir);
  const photos = new Map(files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => [f.replace(/\.[^.]+$/, ""), f]));
  const profiles = new Set(files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
  for (const seg of event.segments) {
    for (const sp of seg.talk?.speakers ?? []) {
      const slug = slugify(sp.name);
      const f = photos.get(slug);
      if (!sp.photo && f) sp.photo = `people/${f}`;
      if (!profiles.has(slug)) continue;
      const p = readProfile(join(peopleDir, `${slug}.json`));
      if (!sp.bio && p.bio) sp.bio = p.bio;
      for (const l of p.links ?? []) {
        if (!(sp.links ?? []).some((x) => sameUrl(x.url, l.url))) (sp.links ??= []).push(l);
      }
    }
  }
  return event;
}
