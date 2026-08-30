import { describe, expect, it } from "vitest";
import { hasAppointmentConflict, hasRemainingSlotCapacity, localDateTimeToTimestamp } from "./availability";
import { buildConfirmationBody } from "./confirmation";

describe("deterministic appointment services", () => {
  it("detects overlapping confirmed appointments but ignores cancelled records", () => {
    const start = localDateTimeToTimestamp("2026-09-02", "10:00");
    const existing = [
      { startAt: start, endAt: start + 30 * 60_000, status: "confirmed" },
      { startAt: start + 60 * 60_000, endAt: start + 90 * 60_000, status: "cancelled" },
    ];
    expect(hasAppointmentConflict(existing, start + 15 * 60_000, start + 45 * 60_000)).toBe(true);
    expect(hasAppointmentConflict(existing, start + 60 * 60_000, start + 90 * 60_000)).toBe(false);
  });

  it("honors persisted slot capacity rather than treating every overlap as fully booked", () => {
    const start = localDateTimeToTimestamp("2026-09-02", "10:00");
    const existing = [{ startAt: start, endAt: start + 30 * 60_000, status: "confirmed" }];
    expect(hasRemainingSlotCapacity(existing, { startAt: start, endAt: start + 30 * 60_000, capacity: 2 })).toBe(true);
    expect(hasRemainingSlotCapacity(existing, { startAt: start, endAt: start + 30 * 60_000, capacity: 1 })).toBe(false);
  });

  it("excludes the current appointment from reschedule capacity validation", () => {
    const start = localDateTimeToTimestamp("2026-09-02", "10:00");
    const existing = [{ id: 91, startAt: start, endAt: start + 30 * 60_000, status: "confirmed" }];
    const slot = { startAt: start, endAt: start + 30 * 60_000, capacity: 1 };
    expect(hasRemainingSlotCapacity(existing, slot)).toBe(false);
    expect(hasRemainingSlotCapacity(existing, slot, 91)).toBe(true);
  });

  it("builds a provider-independent confirmation only from validated booking facts", () => {
    const body = buildConfirmationBody({
      tenantId: 7,
      appointmentId: 24,
      reference: "HD-ABC123",
      practiceName: "Harbour Dental Studio",
      customerName: "Olivia Bennett",
      serviceName: "Dental hygiene",
      startAt: localDateTimeToTimestamp("2026-09-02", "10:00"),
      recipient: "olivia@example.com",
    });
    expect(body).toContain("Harbour Dental Studio");
    expect(body).toContain("HD-ABC123");
    expect(body).toContain("Dental hygiene");
  });
});
