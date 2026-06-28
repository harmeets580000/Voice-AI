import { describe, it, expect } from "vitest";
import { tenantDb, injectOrg } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";

describe("scoped DB guard (U-ISO-10)", () => {
  it("U-ISO-10: tenantDb without an org id throws (fails fast)", () => {
    expect(() => tenantDb("")).toThrow(AppError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => tenantDb(undefined as any)).toThrow(AppError);
  });

  it("tenantDb with an org id returns a client", () => {
    const db = tenantDb("orgA");
    expect(db).toBeTruthy();
  });
});

describe("injectOrg scoping (supports I-ISO-08)", () => {
  it("scopes findMany where to the active org", () => {
    const out = injectOrg("findMany", { where: { isActive: true } }, "orgA");
    expect(out.where).toEqual({ isActive: true, organizationId: "orgA" });
  });

  it("scopes findMany with no where at all", () => {
    const out = injectOrg("findMany", {}, "orgA");
    expect(out.where).toEqual({ organizationId: "orgA" });
  });

  it("stamps create data with the active org", () => {
    const out = injectOrg("create", { data: { name: "Bob" } }, "orgA");
    expect(out.data).toEqual({ name: "Bob", organizationId: "orgA" });
  });

  it("I-ISO-08: a create body trying to set another org id is OVERRIDDEN to the active org", () => {
    const out = injectOrg(
      "create",
      { data: { name: "Bob", organizationId: "orgB" } },
      "orgA",
    );
    expect((out.data as { organizationId: string }).organizationId).toBe("orgA");
  });

  it("overrides organizationId in a where clause to the active org", () => {
    const out = injectOrg(
      "findFirst",
      { where: { organizationId: "orgB" } },
      "orgA",
    );
    expect(out.where).toEqual({ organizationId: "orgA" });
  });

  it("scopes update where and never lets data change the org", () => {
    const out = injectOrg(
      "update",
      { where: { id: "1" }, data: { name: "X" } },
      "orgA",
    );
    expect(out.where).toEqual({ id: "1", organizationId: "orgA" });
    expect(out.data).toEqual({ name: "X" });
  });

  it("scopes upsert where and create, leaves update data", () => {
    const out = injectOrg(
      "upsert",
      {
        where: { id: "1" },
        create: { name: "New" },
        update: { name: "Upd" },
      },
      "orgA",
    );
    expect(out.where).toEqual({ id: "1", organizationId: "orgA" });
    expect(out.create).toEqual({ name: "New", organizationId: "orgA" });
    expect(out.update).toEqual({ name: "Upd" });
  });

  it("stamps each row in createMany", () => {
    const out = injectOrg(
      "createMany",
      { data: [{ name: "A" }, { name: "B" }] },
      "orgA",
    );
    expect(out.data).toEqual([
      { name: "A", organizationId: "orgA" },
      { name: "B", organizationId: "orgA" },
    ]);
  });
});
