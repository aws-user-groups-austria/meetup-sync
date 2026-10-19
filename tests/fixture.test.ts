import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFromHtml } from "../src/build.ts";
import { eventSchema } from "../src/event.schema.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/aws-meetup-vienna-53.html", import.meta.url)), "utf8");
const event = buildFromHtml(html, { fetchedAt: "2026-10-16T12:00:00.000Z" });
const EMOJI = /\p{Extended_Pictographic}/u;

describe("AWS Meetup Vienna #53 (saved page)", () => {
  it("validates against event.schema.ts", () => {
    const r = eventSchema.safeParse(event);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it("has the id, title, group and source", () => {
    expect(event.id).toBe("2026-10-20-aws-meetup-vienna-53");
    expect(event.title).toBe("AWS Meetup Vienna #53 - hosted by RBI");
    expect(event.group).toEqual({
      id: "aws-ug-vienna",
      name: "AWS User Group Vienna",
      url: "https://www.meetup.com/amazon-web-services-aws-vienna/",
    });
    expect(event.source).toEqual({
      meetupUrl: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/",
      fetchedAt: "2026-10-16T12:00:00.000Z",
    });
    expect(event.timezone).toBe("Europe/Vienna");
  });

  it("takes the header image from the featured event photo, full size", () => {
    expect(event.image).toBe("https://secure.meetupstatic.com/photos/event/c/d/4/8/highres_536512552.jpeg");
  });

  it("takes doors open and end from the JSON-LD Event", () => {
    expect(event.doorsOpen).toBe("2026-10-20T17:00:00+02:00");
    expect(event.end).toBe("2026-10-20T22:00:00+02:00");
  });

  it("takes the venue name from the Location block", () => {
    expect(event.venue).toEqual({ name: "Raiffeisen Bank International", address: "Mooslackengasse 12, 1190 Wien, Austria" });
  });

  it("has the tagline as the first paragraph, emoji stripped", () => {
    expect(event.tagline).toBe("Autumn is arriving in Vienna - and so is our next AWS meetup!");
  });

  it("has the seven agenda segments with the right kinds and times", () => {
    const t = (hm: string) => `2026-10-20T${hm}:00+02:00`;
    expect(event.segments.map((s) => [s.id, s.kind, s.start, s.end, s.title])).toEqual([
      ["doors", "networking", t("17:00"), t("18:00"), "Entry & Networking"],
      ["welcome", "welcome", t("18:00"), t("18:05"), "Welcome and Introduction AWS Community Vienna"],
      ["sponsor", "sponsor", t("18:05"), t("18:10"), "Welcome and Introduction to the sponsors (Raiffeisen Bank International)"],
      ["talk-1", "talk", t("18:10"), t("18:50"), "Teaching an AI to Debug Our Cloud: AWS DevOps Agent in Practice"],
      ["break-1", "break", t("18:50"), t("19:20"), "Networking break"],
      ["talk-2", "talk", t("19:20"), t("20:00"), "I don't trust my agents!"],
      ["closing", "closing", t("20:00"), t("22:00"), "Networking"],
    ]);
  });

  it("has both talks with all three speakers", () => {
    const talk1 = event.segments.find((s) => s.id === "talk-1")!.talk!;
    const talk2 = event.segments.find((s) => s.id === "talk-2")!.talk!;
    expect(talk1.title).toBe("Teaching an AI to Debug Our Cloud: AWS DevOps Agent in Practice");
    expect(talk1.speakers).toEqual([
      { name: "Roman Jokel", role: "Cloud Architect", company: "Raiffeisen Bank International", links: [{ title: "LinkedIn", url: "https://www.linkedin.com/in/roman-jokel/" }] },
      { name: "Mladen Trampic", role: "Senior Technical Account Manager", company: "AWS", links: [{ title: "LinkedIn", url: "https://www.linkedin.com/in/trampic/" }] },
    ]);
    expect(talk1.abstract).toMatch(/^AWS DevOps Agent is AWS's AI-powered teammate for operations/);
    expect(talk1.abstract).toMatch(/not just in theory\.$/);
    expect(talk2.title).toBe("I don't trust my agents!");
    expect(talk2.speakers).toEqual([
      { name: "Darko Mesaroš", role: "Principal Technologist", company: "AWS", links: [{ title: "LinkedIn", url: "https://www.linkedin.com/in/darko-mesaros/" }] },
    ]);
    expect(talk2.abstract).toMatch(/^Your AI agent works great in the demo\./);
    expect(talk2.abstract).toMatch(/reference architectures you can adapt immediately\.$/);
  });

  it("has the sponsor RBI, on the list and on the sponsor segment", () => {
    expect(event.sponsors).toEqual([
      { name: "Raiffeisen Bank International AG", short: "RBI", url: "https://www.rbinternational.com/de/raiffeisen.html" },
    ]);
    expect(event.segments.find((s) => s.kind === "sponsor")!.sponsor).toEqual({ name: "Raiffeisen Bank International AG", short: "RBI" });
  });

  it("has the photo and video notice verbatim", () => {
    expect(event.notices).toHaveLength(1);
    expect(event.notices[0]).toMatch(/^By submitting your RSVP, you acknowledge that photos and videos may be taken during the event\./);
    expect(event.notices[0]).toMatch(/subject to separate consent where required\.$/);
    expect(event.notices[0]).not.toMatch(/\*/);
  });

  it("has the links from the page, feedback defaulting to the Meetup page", () => {
    expect(event.links).toEqual({
      meetup: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/",
      feedback: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/",
      codeOfConduct: "http://aws-meetup-vie.s3-website.eu-central-1.amazonaws.com/AWS_Meetup_Vienna-Code_Of_Conduct.pdf",
    });
    expect(event.links.nextEvents).toBeUndefined();
  });

  it("has no emoji and no markdown anywhere", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(event);
    for (const s of strings) {
      expect(s, s).not.toMatch(EMOJI);
      if (!/^https?:/.test(s)) expect(s, s).not.toMatch(/\*\*|\]\(/);
    }
  });
});

describe("no long dashes in the output", () => {
  it("writes a plain hyphen wherever the page has an en or em dash", () => {
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/[\u2012-\u2015]/);
  });
});

