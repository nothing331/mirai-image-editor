import { beforeEach, expect, it, vi } from "vitest";
import { listCloudProjects } from "./cloud-projects";
import { listTrashedProjects } from "./cloud-lifecycle";

const database = vi.hoisted(() => ({ rows: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/server/supabase/admin-client", () => ({ createAdminSupabaseClient: () => ({ from: (table: string) => {
  const filters: Array<[string, unknown]> = [];
  const rows = () => database.rows[table].filter((row) => filters.every(([field, value]) => row[field] === value));
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
    order: () => query,
    range: async (start: number, end: number) => ({ data: rows().slice(start, end + 1), error: null }),
    in: async (field: string, values: unknown[]) => ({ data: rows().filter((row) => values.includes(row[field])), error: null }),
  };
  return query;
} }) }));

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${n.toString().padStart(12, "0")}`;
beforeEach(() => {
  database.rows.asset_uploads = Array.from({ length: 101 }, (_, n) => ({ id: id(n + 201), owner_id: owner, width: n + 1, height: 10, original_name: `${n}.png` }));
  database.rows.cloud_projects = Array.from({ length: 101 }, (_, n) => ({ id: id(n + 1), owner_id: owner, name: `Project ${n}`, status: "active",
    original_upload_id: id(n + 201), current_version_id: id(n + 401), head_version_id: id(n + 401), revision: 0,
    created_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", deleted_at: null, purge_after: null }));
});

it("returns every owned original across library and trash page boundaries", async () => {
  const projects = await listCloudProjects(owner);
  expect(projects).toHaveLength(101);
  expect(new Set(projects.map((project) => project.id)).size).toBe(101);
  expect(projects[100]).toMatchObject({ id: id(101), originalName: "100.png", width: 101 });
  for (const row of database.rows.cloud_projects) row.status = "trash";
  expect(await listTrashedProjects(owner)).toHaveLength(101);
  expect(await listTrashedProjects(id(999))).toEqual([]);
});

it("rejects an incomplete later page instead of returning a truncated library", async () => {
  database.rows.asset_uploads.pop();
  await expect(listCloudProjects(owner)).rejects.toMatchObject({ code: "unavailable" });
});
