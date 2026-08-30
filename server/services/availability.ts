import { ensureAvailabilitySlots, getPracticeBundle, listAppointments, listPersistedAvailabilitySlots } from "../db";

export function localDateTimeToTimestamp(date: string, time: string) {
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid appointment date or time");
  return value.getTime();
}

export function hasAppointmentConflict(
  existing: Array<{ startAt: number; endAt: number; status: string }>,
  startAt: number,
  endAt: number,
) {
  return existing.some(item => item.status === "confirmed" && item.startAt < endAt && item.endAt > startAt);
}

export function hasRemainingSlotCapacity(
  existing: Array<{ id?: number; startAt: number; endAt: number; status: string }>,
  slot: { startAt: number; endAt: number; capacity: number },
  excludeAppointmentId?: number,
) {
  const used = existing.filter(item => (excludeAppointmentId === undefined || item.id !== excludeAppointmentId) && item.status === "confirmed" && item.startAt < slot.endAt && item.endAt > slot.startAt).length;
  return used < slot.capacity;
}

export async function getAvailability(tenantId: number, serviceId: number, date: string, excludeAppointmentId?: number) {
  const bundle = await getPracticeBundle(tenantId);
  const service = bundle.services.find(item => item.id === serviceId && item.active);
  if (!service) throw new Error("Service not found");
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) throw new Error("Invalid date");
  const today = new Date();
  const maxDate = new Date(today.getTime() + bundle.tenant.bookingWindowDays * 86_400_000);
  if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate()) || target > maxDate) return [];
  const hours = bundle.hours.find(item => item.dayOfWeek === target.getDay());
  if (!hours?.isOpen || !hours.openTime || !hours.closeTime) return [];
  const startDay = localDateTimeToTimestamp(date, "00:00");
  const endDay = startDay + 86_400_000 - 1;
  await ensureAvailabilitySlots(tenantId);
  const [existing, persisted] = await Promise.all([
    listAppointments(tenantId, startDay, endDay),
    listPersistedAvailabilitySlots(tenantId, serviceId, startDay, endDay),
  ]);
  return persisted
    .filter(slot => slot.startAt > Date.now() && hasRemainingSlotCapacity(existing, slot, excludeAppointmentId))
    .map(slot => ({ startAt: slot.startAt, endAt: slot.endAt, label: new Date(slot.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }));
}

export async function validateSlot(tenantId: number, serviceId: number, date: string, time: string, excludeAppointmentId?: number) {
  const bundle = await getPracticeBundle(tenantId);
  const service = bundle.services.find(item => item.id === serviceId && item.active);
  if (!service) return { valid: false as const, reason: "Service not found" };
  const available = await getAvailability(tenantId, serviceId, date, excludeAppointmentId);
  const startAt = localDateTimeToTimestamp(date, time);
  const endAt = startAt + service.durationMinutes * 60_000;
  const listed = available.some(slot => slot.startAt === startAt);
  return listed
    ? { valid: true as const, startAt, endAt, service }
    : { valid: false as const, reason: "That time is not available", alternatives: available.slice(0, 4) };
}
