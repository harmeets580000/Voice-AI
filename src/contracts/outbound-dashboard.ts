/**
 * Sales dashboard contract (Product 2 §G).
 */

import { z } from "zod";

export const SalesDashboardPeriod = z.enum(["7d", "30d", "90d"]);
export type SalesDashboardPeriod = z.infer<typeof SalesDashboardPeriod>;

export const SalesDashboardResponse = z.object({
  period: SalesDashboardPeriod,
  kpis: z.object({
    dials: z.number(),
    leadsCreated: z.number(),
    conversionPct: z.number(),
    pipelineValue: z.number(),
  }),
  trend: z.array(z.object({ date: z.string(), value: z.number() })),
  funnel: z.array(z.object({ key: z.string(), count: z.number() })),
  campaignPerf: z.array(z.object({ key: z.string(), count: z.number() })),
});
export type SalesDashboardResponse = z.infer<typeof SalesDashboardResponse>;
