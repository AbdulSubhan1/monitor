import { describe, expect, it } from "vitest";
import { findProject, PROJECT_IDS, PROJECTS } from "./projects";

describe("projects", () => {
  it("watches the Zaitul Husn shop through its health check", () => {
    expect(PROJECT_IDS).toContain("zaitulhusn");
    expect(findProject("zaitulhusn")?.checkPath).toBe("/api/health");
  });

  it("gives every watched project a URL that parses", () => {
    for (const p of PROJECTS) expect(() => new URL(p.url)).not.toThrow();
  });
});
