/**
 * Product registry contract — the FE<->BE seam for enabling/disabling products (modules)
 * per org. Drives the Outbound Sales nav gate and the Products settings page.
 */

import { z } from "zod";

export const ProductKeySchema = z.enum(["AI_RECEPTIONIST", "OUTBOUND_SALES"]);
export type ProductKeyDTO = z.infer<typeof ProductKeySchema>;

export const OrgProductStatusSchema = z.enum(["active", "inactive"]);
export type OrgProductStatusDTO = z.infer<typeof OrgProductStatusSchema>;

export const ProductDTO = z.object({
  product: ProductKeySchema,
  status: OrgProductStatusSchema,
  enabledAt: z.string().nullable(),
});
export type ProductDTO = z.infer<typeof ProductDTO>;

export const ProductsResponse = z.object({
  products: z.array(ProductDTO),
});
export type ProductsResponse = z.infer<typeof ProductsResponse>;

export const SetProductRequest = z.object({
  status: OrgProductStatusSchema,
});
export type SetProductRequest = z.infer<typeof SetProductRequest>;
