import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  appointments,
  availabilitySlots,
  businessHours,
  callMessages,
  calls,
  confirmations,
  customers,
  integrationConfigs,
  knowledgeItems,
  services,
  toolEvents,
} from "../drizzle/schema";

describe("tenant isolation schema", () => {
  it("requires tenant identity on every operational record", () => {
    const tenantOwnedTables = [
      appointments,
      availabilitySlots,
      businessHours,
      callMessages,
      calls,
      confirmations,
      customers,
      integrationConfigs,
      knowledgeItems,
      services,
      toolEvents,
    ];

    for (const table of tenantOwnedTables) {
      const columns = getTableColumns(table);
      expect(columns).toHaveProperty("tenantId");
      expect(columns.tenantId.notNull).toBe(true);
    }
  });
});
