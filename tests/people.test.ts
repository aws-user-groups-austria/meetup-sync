import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFromHtml } from "../src/build.ts";
import { applyPeople } from "../src/people.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/aws-meetup-vienna-53.html", import.meta.url)), "utf8");
const built = () => buildFromHtml(html, { fetchedAt: "2026-10-16T12:00:00.000Z" });
const speakers = (e: ReturnType<typeof built>) => e.segments.flatMap((s) => s.talk?.speakers ?? []);

function folder(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "people-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("people/", () => {
  it("fills photos, bios and links by name", () => {
    const dir = folder({
      "mladen-trampic.png": "",
      "mladen-trampic.json": JSON.stringify({
        bio: "Mladen helps customers run AWS.",
        links: [
          { title: "LinkedIn", url: "https://www.linkedin.com/in/trampic" },
          { title: "GitHub", url: "https://github.com/example" },
          { title: "Bad", url: "javascript:alert(1)" },
        ],
      }),
    });
    const mladen = speakers(applyPeople(built(), dir)).find((s) => s.name === "Mladen Trampic")!;
    expect(mladen.photo).toBe("people/mladen-trampic.png");
    expect(mladen.bio).toBe("Mladen helps customers run AWS.");
    // the description's LinkedIn link stays first, the same link is not added twice
    expect(mladen.links).toEqual([
      { title: "LinkedIn", url: "https://www.linkedin.com/in/trampic/" },
      { title: "GitHub", url: "https://github.com/example" },
    ]);
  });

  it("keeps a bio the speaker already has", () => {
    const dir = folder({ "darko-mesaros.json": JSON.stringify({ bio: "From the file." }) });
    const e = built();
    speakers(e).find((s) => s.name === "Darko Mesaroš")!.bio = "Already there.";
    expect(speakers(applyPeople(e, dir)).find((s) => s.name === "Darko Mesaroš")!.bio).toBe("Already there.");
  });
});
