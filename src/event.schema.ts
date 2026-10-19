/**
 * event.json, version 1: the one contract between meetup-sync (which writes it
 * from a Meetup page), the scenes and the web player (which read it). See
 * ../../SPEC.md. meetup-sync keeps an identical copy in src/event.schema.ts;
 * change both together.
 */
import { z } from "zod";

const isoWithOffset = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/, "ISO 8601 with an offset");

export const speakerSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  company: z.string().optional(),
  photo: z.string().optional(),
  /** A few sentences about the person, plain text (Sessionize, people/<name>.json or source.json). */
  bio: z.string().optional(),
  /** Profiles: LinkedIn (from the Meetup description's speaker link), website, GitHub, ... */
  links: z.array(z.object({ title: z.string().min(1), url: z.string().url() })).optional(),
});

export const sponsorSchema = z.object({
  name: z.string().min(1),
  short: z.string().optional(),
  logo: z.string().optional(),
  url: z.string().url().optional(),
});

/** A coming AWS Community Day (or similar) to announce, from meetup-event-vienna/upcoming.json. */
export const upcomingSchema = z.object({
  name: z.string().min(1),
  /** First day, local, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  /** Last day for a multi-day event. */
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional(),
  location: z.string().min(1),
  url: z.string().url(),
  /** Who from the community speaks there; photos as for talk speakers, or people/<file>. */
  speakers: z.array(speakerSchema).optional(),
  /** A screenshot of its website (community/<file>, 16:9), shown with the link and a QR code. */
  screenshot: z.string().optional(),
});

/** The group itself, for the room screen's intro (who we are, groups, badges, code of conduct). */
export const communitySchema = z.object({
  name: z.string().min(1),
  team: z.array(z.object({ name: z.string().min(1), role: z.string().optional(), photo: z.string().optional(), email: z.string().email().optional() })),
  groups: z.array(z.object({ name: z.string().min(1), logo: z.string().optional(), url: z.string().url().optional() })),
  badges: z.array(z.object({ name: z.string().min(1), image: z.string().min(1), title: z.string().min(1), text: z.string().optional() })),
  codeOfConduct: z
    .object({ title: z.string().min(1), subtitle: z.string().optional(), lines: z.array(z.string()), url: z.string().url().optional() })
    .optional(),
  photos: z.array(z.string()),
  links: z.object({ website: z.string().url().optional(), meetup: z.string().url().optional(), linkedin: z.string().url().optional() }),
});

export const segmentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  kind: z.enum(["networking", "welcome", "sponsor", "talk", "break", "closing"]),
  start: isoWithOffset,
  end: isoWithOffset,
  title: z.string().min(1),
  talk: z
    .object({
      title: z.string().min(1),
      abstract: z.string().optional(),
      speakers: z.array(speakerSchema),
    })
    .optional(),
  sponsor: sponsorSchema.omit({ url: true }).optional(),
});

export const eventSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
    source: z.object({ meetupUrl: z.string().url(), fetchedAt: isoWithOffset }),
    title: z.string().min(1),
    tagline: z.string().optional(),
    /** The event's header image on Meetup (featured photo, full size). */
    image: z.string().url().optional(),
    group: z.object({ id: z.string().min(1), name: z.string().min(1), url: z.string().url() }),
    timezone: z.literal("Europe/Vienna"),
    doorsOpen: isoWithOffset,
    end: isoWithOffset,
    venue: z.object({ name: z.string().min(1), address: z.string().min(1) }),
    sponsors: z.array(sponsorSchema),
    segments: z.array(segmentSchema).min(1),
    links: z.object({
      meetup: z.string().url(),
      feedback: z.string().url(),
      codeOfConduct: z.string().url().optional(),
      nextEvents: z.string().url().optional(),
    }),
    notices: z.array(z.string()),
    upcoming: z.array(upcomingSchema).optional(),
    community: communitySchema.optional(),
  })
  .superRefine((e, ctx) => {
    const t = (s: string) => Date.parse(s);
    e.segments.forEach((s, i) => {
      if (t(s.end) <= t(s.start)) ctx.addIssue({ code: "custom", path: ["segments", i], message: "end must be after start" });
      if (i > 0 && t(s.start) < t(e.segments[i - 1]!.start)) ctx.addIssue({ code: "custom", path: ["segments", i], message: "segments must be in time order" });
      if (s.kind === "talk" && !s.talk) ctx.addIssue({ code: "custom", path: ["segments", i], message: "a talk segment needs talk details" });
    });
    if (t(e.end) <= t(e.doorsOpen)) ctx.addIssue({ code: "custom", path: ["end"], message: "end must be after doorsOpen" });
  });

export type EventFile = z.infer<typeof eventSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Speaker = z.infer<typeof speakerSchema>;
export type Upcoming = z.infer<typeof upcomingSchema>;
export type Community = z.infer<typeof communitySchema>;
