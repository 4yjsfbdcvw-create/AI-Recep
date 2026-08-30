import { createConfirmation } from "../db";

export type ConfirmationPayload = {
  tenantId: number;
  appointmentId: number;
  reference: string;
  practiceName: string;
  customerName: string;
  serviceName: string;
  startAt: number;
  recipient?: string;
};

export interface ConfirmationAdapter {
  send(payload: ConfirmationPayload): Promise<{ id: number; status: "sent" | "queued" }>;
}

export function buildConfirmationBody(payload: ConfirmationPayload) {
  const date = new Date(payload.startAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
  return `${payload.practiceName}: ${payload.serviceName} for ${payload.customerName} is confirmed for ${date}. Reference ${payload.reference}.`;
}

export class InAppConfirmationAdapter implements ConfirmationAdapter {
  async send(payload: ConfirmationPayload) {
    const body = buildConfirmationBody(payload);
    const result = await createConfirmation(payload.tenantId, payload.appointmentId, body, payload.recipient, "in_app");
    return { id: result.id, status: result.status };
  }
}

export class QueuedEmailConfirmationAdapter implements ConfirmationAdapter {
  async send(payload: ConfirmationPayload) {
    const body = buildConfirmationBody(payload);
    const result = await createConfirmation(payload.tenantId, payload.appointmentId, body, payload.recipient, "email");
    return { id: result.id, status: result.status };
  }
}
