
import { z } from "zod";

const commonFields = {
  event_id: z.string().trim().min(1).max(200),
  order_id: z.string().trim().min(1).max(200),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  occurred_at: z.string().datetime({ offset: true }),
};

export const paymentWebhookSchema = z.object({
  ...commonFields,
  type: z.literal("order.paid"),
  tier_id: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  amount_total: z.number().int().nonnegative(),
});

export const refundWebhookSchema = z.object({
  ...commonFields,
  type: z.literal("order.refunded"),
  amount_refunded: z.number().int().positive(),
});

export const webhookSchema = z.discriminatedUnion("type", [
  paymentWebhookSchema,
  refundWebhookSchema,
]);

export type PaymentWebhook = z.infer<
  typeof paymentWebhookSchema
>;

export type RefundWebhook = z.infer<
  typeof refundWebhookSchema
>;

export type PaymentWebhookPayload = z.infer<
  typeof webhookSchema
>;
