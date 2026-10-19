import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFromHtml } from "../src/build.ts";
import { eventSchema } from "../src/event.schema.ts";
import { applySessionize, embedHtmlUrl, loadSessionize, normalizeName, parseEmbedHtml, sessionizeAllUrl, type SessionizeAll } from "../src/sessionize.ts";
import { syncHtml } from "../src/sync.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const html = readFileSync(fixture("aws-meetup-vienna-53.html"), "utf8");
const sample: SessionizeAll = JSON.parse(readFileSync(fixture("sessionize-all.sample.json"), "utf8"));
const built = () => buildFromHtml(html, { fetchedAt: "2026-10-16T12:00:00.000Z" });
const talks = (e: ReturnType<typeof built>) => e.segments.filter((s) => s.kind === "talk").map((s) => s.talk!);

describe("Sessionize", () => {
  it("matches names without accents or case", () => {
    expect(normalizeName("Darko  Mesaroš")).toBe(normalizeName("darko mesaros"));
  });

  it("fills speaker photos from https profile pictures only", () => {
    const { event } = applySessionize(built(), sample);
    const [one, two] = talks(event);
    expect(one!.speakers.map((s) => s.photo)).toEqual([
      "https://sessionize.com/image/sample-roman.jpg",
      "https://sessionize.com/image/sample-mladen.jpg",
    ]);
    // Darko's sample picture is http: not used
    expect(two!.speakers[0]!.photo).toBeUndefined();
  });

  it("keeps what the Meetup page says: roles and abstracts are not replaced", () => {
    const before = talks(built());
    const { event } = applySessionize(built(), sample);
    const after = talks(event);
    expect(after.map((t) => t.abstract)).toEqual(before.map((t) => t.abstract));
    expect(after[0]!.speakers.map((s) => [s.role, s.company])).toEqual(before[0]!.speakers.map((s) => [s.role, s.company]));
  });

  it("fills an abstract and the speakers of a talk the page left without them", () => {
    const e = built();
    const t = talks(e)[1]!;
    delete t.abstract;
    t.speakers = [];
    applySessionize(e, sample);
    expect(t.abstract).toBe("Sample abstract for talk two.");
    expect(t.speakers).toEqual([{ name: "Darko Mesaros", role: "Sample tagline" }]);
  });

  it("warns about talks and speakers it cannot find", () => {
    const data: SessionizeAll = { sessions: [{ id: 1, title: "Something else", speakers: [] }], speakers: [] };
    const { warnings } = applySessionize(built(), data);
    expect(warnings).toEqual([
      'Sessionize has no session titled "Teaching an AI to Debug Our Cloud: AWS DevOps Agent in Practice"',
      `Sessionize has no session titled "I don't trust my agents!"`,
    ]);
  });

  it("runs before the overrides, so an override still wins", () => {
    const overrides = {
      segments: [{ id: "talk-1", talk: { speakers: [{ name: "Roman Jokel", photo: "events/x/assets/roman.jpg" }] } }],
    };
    const { event } = syncHtml({ html, fetchedAt: "2026-10-16T12:00:00.000Z" }, overrides, sample);
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(talks(event as never)[0]!.speakers.map((s) => s.photo)).toEqual([
      "events/x/assets/roman.jpg",
      "https://sessionize.com/image/sample-mladen.jpg",
    ]);
  });

  it("loads a saved file and rejects other JSON", async () => {
    expect((await loadSessionize(fixture("sessionize-all.sample.json"))).sessions).toHaveLength(2);
    await expect(loadSessionize(fixture("../../package.json"))).rejects.toThrow(/not Sessionize data/);
  });

  it("builds the view/All URL from an endpoint id", () => {
    expect(sessionizeAllUrl("abc123de")).toBe("https://sessionize.com/api/v2/abc123de/view/All");
  });

  it("reads the embed format: names, taglines, photos, shared talks", async () => {
    const d = await loadSessionize(fixture("sessionize-embed.sample.html"));
    expect(d.speakers!.map((s) => [s.fullName, s.tagLine, s.profilePicture])).toEqual([
      ["Roman Jokel", "Sample & tagline", "https://cdn.sessionize.com/image/sample-1.jpg"],
      ["Mladen Trampic", undefined, "https://cdn.sessionize.com/image/sample-2.jpg"],
      ["Darko Mesaros", undefined, "https://cdn.sessionize.com/image/sample-3.jpg"],
    ]);
    expect(d.sessions!.map((s) => [s.title, s.speakers])).toEqual([
      ["Teaching an AI to Debug Our Cloud: AWS DevOps Agent in Practice", ["s-1", "s-2"]],
      ["I don't trust my agents!", ["s-3"]],
    ]);
  });

  it("fills the real event's photos from the embed, accents ignored", () => {
    const html2 = readFileSync(fixture("sessionize-embed.sample.html"), "utf8");
    const { event, warnings } = applySessionize(built(), parseEmbedHtml(html2));
    expect(warnings).toEqual([]);
    expect(talks(event).flatMap((t) => t.speakers.map((s) => s.photo))).toEqual([
      "https://cdn.sessionize.com/image/sample-1.jpg",
      "https://cdn.sessionize.com/image/sample-2.jpg",
      "https://cdn.sessionize.com/image/sample-3.jpg",
    ]);
  });

  it("reads bios from the embed, paragraphs kept, and fills only missing ones", () => {
    const d = parseEmbedHtml(
      `<li data-speakerid="a"> <h3 class="sz-speaker__name">Darko Mesaroš</h3> <p class="sz-speaker__bio">I write Rust &amp; break things.<br><br>I also build MCP servers.</p> </li>`,
    );
    expect(d.speakers![0]!.bio).toBe("I write Rust & break things.\n\nI also build MCP servers.");
    const { event } = applySessionize(built(), d);
    expect(talks(event)[1]!.speakers[0]!.bio).toBe("I write Rust & break things.\n\nI also build MCP servers.");
    const e = built();
    talks(e)[1]!.speakers[0]!.bio = "Own bio.";
    expect(talks(applySessionize(e, d).event)[1]!.speakers[0]!.bio).toBe("Own bio.");
  });

  it("adds JSON profile links after the description's LinkedIn link, without duplicates", () => {
    const data: SessionizeAll = {
      speakers: [
        {
          id: "d",
          fullName: "Darko Mesaros",
          links: [
            { title: "LinkedIn", url: "https://www.linkedin.com/in/darko-mesaros" },
            { title: "Blog", url: "https://rup12.net/" },
            { title: "Old", url: "http://insecure.example/" },
          ],
        },
      ],
    };
    const { event } = applySessionize(built(), data);
    expect(talks(event)[1]!.speakers[0]!.links).toEqual([
      { title: "LinkedIn", url: "https://www.linkedin.com/in/darko-mesaros/" },
      { title: "Blog", url: "https://rup12.net/" },
    ]);
  });

  it("asks an embed endpoint for its HTML", () => {
    expect(embedHtmlUrl("https://sessionize.com/api/v2/abc123de/view/Speakers")).toBe(
      "https://sessionize.com/api/v2/abc123de/view/Speakers?under=True",
    );
  });
});
