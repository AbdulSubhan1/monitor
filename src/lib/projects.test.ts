import { describe, expect, it } from "vitest";
import { findProject, PROJECT_IDS, PROJECTS } from "./projects";

describe("projects", () => {
  it("leaves a project without a URL out until it is deployed", () => {
    expect(PROJECT_IDS).not.toContain("zaitulhusn");
    expect(findProject("zaitulhusn")).toBeUndefined();
  });

  it("gives every watched project a URL that parses", () => {
    for (const p of PROJECTS) expect(() => new URL(p.url)).not.toThrow();
  });
});
