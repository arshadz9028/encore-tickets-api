
import { z } from "zod";

export const createHoldSchema = z.object({
  tier_id: z.string().trim().min(1, "tier_id is required"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(100, "Quantity cannot exceed 100"),
});

export type CreateHoldInput = z.infer<typeof createHoldSchema>;
