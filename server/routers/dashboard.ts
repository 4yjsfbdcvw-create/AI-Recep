import { publicProcedure, router } from "../_core/trpc";
import { ensureDemoTenant, getMetrics, listAppointments, listRecentCalls } from "../db";

export const dashboardRouter = router({
  overview: publicProcedure.query(async () => {
    const tenant = await ensureDemoTenant();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [schedule, calls, metrics] = await Promise.all([
      listAppointments(tenant.id, start.getTime(), start.getTime() + 86_400_000 - 1),
      listRecentCalls(tenant.id, 8),
      getMetrics(tenant.id),
    ]);
    return { tenant, schedule, calls, metrics };
  }),
  calls: publicProcedure.query(async () => {
    const tenant = await ensureDemoTenant();
    return listRecentCalls(tenant.id, 40);
  }),
});
