import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eventSchema } from "../src/event.schema.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = join(root, "tests/fixtures/aws-meetup-vienna-53.html");
const run = (...args: string[]) => spawnSync(process.execPath, ["src/cli.ts", ...args], { cwd: root, encoding: "utf8" });

describe("cli", () => {
  const dir = mkdtempSync(join(tmpdir(), "meetup-sync-"));

  it("writes a valid event.json from a saved page, with source.json overrides", () => {
    const source = join(dir, "source.json");
    writeFileSync(
      source,
      JSON.stringify({
        meetupUrl: "https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/",
        overrides: { links: { nextEvents: "https://awscommunity.at/" } },
      }),
    );
    const out = join(dir, "out", "event.json");
    const r = run("sync", fixture, "--overrides", source, "--out", out);
    expect(r.status, r.stderr).toBe(0);
    const event = eventSchema.parse(JSON.parse(readFileSync(out, "utf8")));
    expect(event.id).toBe("2026-10-20-aws-meetup-vienna-53");
    expect(event.links.nextEvents).toBe("https://awscommunity.at/");
  });

  it("exits 1 with the zod issues when the result is invalid", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ overrides: { links: { feedback: "not a url" }, segments: [{ id: "talk-1", end: "2026-10-20T18:00:00+02:00" }] } }));
    const out = join(dir, "never.json");
    const r = run("sync", fixture, "--overrides", bad, "--out", out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("links.feedback");
    expect(r.stderr).toContain("end must be after start");
    expect(() => readFileSync(out)).toThrow();
  });

  it("prints the event id", () => {
    const r = run("id", fixture);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("2026-10-20-aws-meetup-vienna-53");
  });

  it("exits 2 on bad usage or a page that is not a Meetup event", () => {
    expect(run("sync").status).toBe(2);
    const empty = join(dir, "empty.html");
    writeFileSync(empty, "<html><body>nothing</body></html>");
    const r = run("sync", empty);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("page error");
  });
});
