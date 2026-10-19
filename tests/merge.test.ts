import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deepMerge } from "../src/merge.ts";
import { syncHtml, ValidationError } from "../src/sync.ts";

describe("deepMerge", () => {
  it("merges objects recursively and leaves the base untouched", () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    expect(deepMerge(base, { b: { d: 4, e: 5 } })).toEqual({ a: 1, b: { c: 2, d: 4, e: 5 } });
    expect(base).toEqual({ a: 1, b: { c: 2, d: 3 } });
  });

  it("merges arrays of objects by id, then by name, appending new ones", () => {
    const base = {
      segments: [
        { id: "talk-1", talk: { speakers: [{ name: "A", role: "R" }, { name: "B" }] } },
        { id: "closing", title: "Networking" },
      ],
    };
    const out = deepMerge(base, { segments: [{ id: "talk-1", talk: { speakers: [{ name: "B", photo: "b.jpg" }, { name: "C" }] } }] });
    expect(out).toEqual({
      segments: [
        { id: "talk-1", talk: { speakers: [{ name: "A", role: "R" }, { name: "B", photo: "b.jpg" }, { name: "C" }] } },
        { id: "closing", title: "Networking" },
      ],
    });
  });

  it("replaces arrays of plain values", () => {
    expect(deepMerge({ notices: ["a", "b"] }, { notices: ["c"] })).toEqual({ notices: ["c"] });
  });

  it("removes a key set to null", () => {
    expect(deepMerge({ a: 1, b: { c: 2 } }, { b: { c: null } })).toEqual({ a: 1, b: {} });
  });

  it("returns a copy when there is nothing to merge", () => {
    const base = { a: [1] };
    const out = deepMerge(base, undefined);
    expect(out).toEqual(base);
    expect(out).not.toBe(base);
  });
});

describe("overrides on the saved page", () => {
  const html = readFileSync(fileURLToPath(new URL("./fixtures/aws-meetup-vienna-53.html", import.meta.url)), "utf8");
  const page = { html, fetchedAt: "2026-10-16T12:00:00.000Z" };

  it("applies speaker photos, sponsor logo, feedback link and venue name last", () => {
    const { event, warnings } = syncHtml(page, {
      venue: { name: "RBI Campus" },
      links: { feedback: "https://example.com/feedback" },
      sponsors: [{ name: "Raiffeisen Bank International AG", logo: "assets/rbi.svg" }],
      segments: [{ id: "talk-2", talk: { speakers: [{ name: "Darko Mesaroš", photo: "assets/darko.jpg" }] } }],
    });
    expect(warnings).toEqual([]);
    expect(event.venue).toEqual({ name: "RBI Campus", address: "Mooslackengasse 12, 1190 Wien, Austria" });
    expect(event.links.feedback).toBe("https://example.com/feedback");
    expect(event.sponsors[0]!.logo).toBe("assets/rbi.svg");
    expect(event.segments.find((s) => s.id === "sponsor")!.sponsor!.logo).toBe("assets/rbi.svg");
    expect(event.segments.find((s) => s.id === "talk-2")!.talk!.speakers).toEqual([
      {
        name: "Darko Mesaroš",
        role: "Principal Technologist",
        company: "AWS",
        links: [{ title: "LinkedIn", url: "https://www.linkedin.com/in/darko-mesaros/" }],
        photo: "assets/darko.jpg",
      },
    ]);
    expect(event.segments).toHaveLength(7);
  });

  it("rejects overrides that break the schema, with the zod issues", () => {
    expect(() => syncHtml(page, { links: { feedback: "not a url" } })).toThrow(ValidationError);
    try {
      syncHtml(page, { links: { feedback: "not a url" } });
    } catch (e) {
      expect((e as ValidationError).issues.map((i) => i.path.join("."))).toContain("links.feedback");
    }
  });

  it("warns about unknown keys instead of writing them", () => {
    const { event, warnings } = syncHtml(page, { venu: { name: "x" } });
    expect(warnings).toEqual(["ignored unknown key: venu"]);
    expect("venu" in event).toBe(false);
  });
});
