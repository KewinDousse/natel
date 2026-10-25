// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assemble,
  compareVersions,
  readFragment,
  releaseNotes,
  validateVersion,
} from "../../scripts/changes.mjs";
import { promotion } from "../../scripts/release.mjs";

const changelog =
  "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Several\n  addresses.\n\n## [0.3.1] - 2026-10-20\n\n### Fixed\n\n- Existing release.\n";

describe("release notes", () => {
  it("assembles pending entries, keeps published history and puts upgrade actions first", () => {
    const result = assemble(
      changelog,
      [
        { type: "Added", text: "Several addresses." },
        { type: "Upgrade notes", text: "Set the new variable." },
        { type: "None", text: "Internal checks only." },
      ],
      "0.4.0",
      "2026-10-24",
    );
    expect(result).toContain("## [Unreleased]\n\n## [0.4.0] - 2026-10-24");
    expect(result.indexOf("### Upgrade notes")).toBeLessThan(result.indexOf("### Added"));
    expect(result.match(/- Several addresses\./g)).toHaveLength(1);
    expect(result).not.toContain("Internal checks");
    expect(result.endsWith(changelog.slice(changelog.indexOf("## [0.3.1]")))).toBe(true);
  });
  it("turns relative documentation links into links to the exact release", () => {
    const source = assemble(
      changelog,
      [{ type: "Changed", text: "Read [deployment](docs/deployment.md#updating)." }],
      "0.4.0",
      "2026-10-24",
    );
    const notes = releaseNotes(source, "0.4.0");
    expect(notes).toContain(
      "https://github.com/KewinDousse/natel/blob/v0.4.0/docs/deployment.md#updating",
    );
    expect(notes).not.toContain("Existing release");
  });
  it.each([
    "{}",
    '{"type":"Added","text":"TODO"}',
    '{"type":"Unknown","text":"A change."}',
    '{"type":"None","text":""}',
    '{"type":"Fixed","text":"<script>"}',
  ])("rejects unfinished or invalid notes: %s", (text) =>
    expect(() => readFragment(text)).toThrow(),
  );
  it("includes preview features in the stable release even without new fragments", () => {
    const preview = assemble(changelog, [], "0.4.0-rc.1", "2026-10-24");
    const stable = assemble(preview, [], "0.4.0", "2026-10-25");
    expect(releaseNotes(stable, "0.4.0")).toContain("Several addresses.");
    expect(stable).toContain("## [0.4.0-rc.1] - 2026-10-24");
  });
  it("requires a user-facing change for a release", () =>
    expect(() =>
      assemble(
        "# Changelog\n\n## [Unreleased]\n",
        [{ type: "None", text: "Tests only." }],
        "0.4.0",
        "2026-10-24",
      ),
    ).toThrow());
});

describe("version and promotion rules", () => {
  it.each(["0.4.0", "1.0.0-rc.1", "1.0.0-alpha.beta"])("accepts %s", (version) =>
    expect(validateVersion(version)).toBe(version),
  );
  it.each(["v1.0.0", "01.0.0", "1.0.0-rc.01", "1.0.0\n", "1.0.0+build", "$(command)"])(
    "rejects %s",
    (version) => expect(() => validateVersion(version)).toThrow(),
  );
  it("compares numeric versions and prereleases, rather than text or publication date", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBe(1);
  });
  it("does not regress aliases after a release is recorded but alias promotion fails", () => {
    const history = [{ tag_name: "v0.5.0" }];
    expect(promotion("0.4.4", history)).toEqual({ latest: false, minor: true });
    expect(promotion("0.5.0", history)).toEqual({ latest: true, minor: true });
  });
  it("keeps the stable and minor aliases from moving backwards", () => {
    const releases = [
      { tag_name: "v0.5.0" },
      { tag_name: "v0.4.3" },
      { tag_name: "v2.0.0-rc.1", prerelease: true },
    ];
    expect(promotion("0.4.4", releases)).toEqual({ latest: false, minor: true });
    expect(promotion("0.4.2", releases)).toEqual({ latest: false, minor: false });
    expect(promotion("0.6.0", releases)).toEqual({ latest: true, minor: true });
    expect(promotion("2.0.0-rc.2", releases)).toEqual({ latest: false, minor: false });
  });
});
