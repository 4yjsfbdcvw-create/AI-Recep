import { describe, expect, it } from "vitest";
import { groundedKnowledgeResponse } from "./orchestrator";

const bundle = {
  tenant: { address: "18 Wren Street", parkingInstructions: "Two patient bays are behind the practice." },
  services: [
    { name: "Dental hygiene", priceMinor: 8900, currency: "GBP" },
    { name: "Routine dental check-up", priceMinor: 6500, currency: "GBP" },
  ],
  hours: [
    { dayOfWeek: 1, isOpen: true, openTime: "08:30", closeTime: "17:30" },
    { dayOfWeek: 0, isOpen: false, openTime: null, closeTime: null },
  ],
  knowledge: [],
  integrations: [],
} as never;

describe("tenant-grounded knowledge", () => {
  it("answers pricing from configured services", () => {
    expect(groundedKnowledgeResponse("PRICING_QUERY", "How much is hygiene?", bundle, [])).toContain("£89.00");
  });

  it("answers location and parking from the tenant record", () => {
    const answer = groundedKnowledgeResponse("LOCATION_QUERY", "Where can I park?", bundle, []);
    expect(answer).toContain("18 Wren Street");
    expect(answer).toContain("Two patient bays");
  });

  it("answers compound opening-hours and parking questions", () => {
    const answer = groundedKnowledgeResponse("OPENING_HOURS", "When are you open and where can I park?", bundle, []);
    expect(answer).toContain("Monday 08:30–17:30");
    expect(answer).toContain("Two patient bays");
  });

  it("answers service-detail questions from configured service descriptions", () => {
    const answer = groundedKnowledgeResponse("GENERAL_ENQUIRY", "What happens during dental hygiene?", bundle, []);
    expect(answer).toContain("Dental hygiene");
    expect(answer).toContain("£89.00");
  });
});
