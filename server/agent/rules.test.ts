import { describe, expect, it } from "vitest";
import { assertValidatedTransactionalClaim, fallbackExtractTurn, shouldEscalate, toolUnavailableHandoffReason } from "./rules";

describe("reception safety rules", () => {
  it("recognizes a dental booking request and extracts explicit details", () => {
    const result = fallbackExtractTurn(
      "I'd like to book a cleaning on 2026-09-03 at 2:30 pm. My name is Alex Morgan and my number is 07123 456789",
      new Date("2026-08-30T12:00:00Z"),
    );
    expect(result.intent).toBe("BOOK_APPOINTMENT");
    expect(result.service).toBe("cleaning");
    expect(result.date).toBe("2026-09-03");
    expect(result.time).toBe("14:30");
    expect(result.customerPhone).toBe("07123456789");
    expect(result.customerName).toBe("Alex Morgan");
  });

  it("escalates explicit human requests and repeated misunderstanding", () => {
    expect(shouldEscalate(fallbackExtractTurn("I want a human"), 0)).toContain("requested");
    expect(shouldEscalate(fallbackExtractTurn("something unclear"), 2)).toContain("repeated");
  });

  it("recognizes natural confirmation wording", () => {
    expect(fallbackExtractTurn("Yes, please confirm it.").confirmation).toBe(true);
    expect(fallbackExtractTurn("Go ahead with that time").confirmation).toBe(true);
  });

  it("blocks appointment claims without a validated tool result", () => {
    expect(() => assertValidatedTransactionalClaim(false, "Your appointment is confirmed")).toThrow(/Blocked/);
    expect(assertValidatedTransactionalClaim(true, "Your appointment is confirmed")).toContain("confirmed");
  });

  it("provides a safe handoff reason when a required tool is unavailable", () => {
    expect(toolUnavailableHandoffReason("booking")).toContain("Reception needs to complete this request safely");
  });
});
