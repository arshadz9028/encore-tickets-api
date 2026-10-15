
import {
  HoldStatus,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  PaymentWebhookPayload,
} from "@/lib/webhook-validation";

export class WebhookError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ORDER"
      | "TIER_NOT_FOUND"
      | "HOLD_NOT_FOUND"
      | "ORDER_MISMATCH"
      | "INVALID_REFUND",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

interface LockedTier {
  id: string;
}

async function lockTier(
  tx: Prisma.TransactionClient,
  tierId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<LockedTier[]>(
    Prisma.sql`
      SELECT id
      FROM tiers
      WHERE id = ${tierId}
      FOR UPDATE
    `,
  );

  if (rows.length === 0) {
    throw new WebhookError(
      "TIER_NOT_FOUND",
      "The payment references an unknown ticket tier.",
      422,
    );
  }
}


async function lockOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${orderId}))
    `,
  );
}


export async function processPaymentWebhook(
  payload: PaymentWebhookPayload,
) {
  return prisma.$transaction(
    async (tx) => {
      // Insert the idempotency key. A duplicate waits for any
      // competing insert and then returns no rows.
      const inserted = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          INSERT INTO webhook_events
            (id, event_type, payload, created_at)
          VALUES (
            ${payload.event_id},
            ${payload.type},
            ${JSON.stringify(payload)}::jsonb,
            NOW()
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `,
      );

      if (inserted.length === 0) {
        return {
          received: true,
          duplicate: true,
          event_id: payload.event_id,
        };
      }

      // Serialize payment/refund events for this order.
      await lockOrder(tx, payload.order_id);

      if (payload.type === "order.paid") {
        await lockTier(tx, payload.tier_id);

        const tier = await tx.tier.findUnique({
          where: { id: payload.tier_id },
          select: {
            id: true,
            price: true,
            currency: true,
          },
        });

        if (!tier) {
          throw new WebhookError(
            "TIER_NOT_FOUND",
            "The ticket tier does not exist.",
            422,
          );
        }

        if (
          tier.currency.toUpperCase() !==
            payload.currency.toUpperCase() ||
          tier.price * payload.quantity !== payload.amount_total
        ) {
          throw new WebhookError(
            "ORDER_MISMATCH",
            "The payment amount or currency does not match the ticket tier.",
            422,
          );
        }

        const existingOrder = await tx.order.findUnique({
          where: { id: payload.order_id },
        });

        // A refund may have arrived before this payment.
        // Never overwrite that terminal state with "paid".
        if (existingOrder?.status === OrderStatus.refunded) {
          await tx.order.update({
            where: { id: payload.order_id },
            data: {
              tierId: payload.tier_id,
              quantity: payload.quantity,
              amountTotal: payload.amount_total,
              currency: payload.currency.toUpperCase(),
            },
          });

          await tx.webhookEvent.update({
            where: { id: payload.event_id },
            data: { processedAt: new Date() },
          });

          return {
            received: true,
            duplicate: false,
            event_id: payload.event_id,
            order_status: OrderStatus.refunded,
            note: "The order was already refunded.",
          };
        }

        if (existingOrder) {
          if (
            existingOrder.tierId !== payload.tier_id ||
            existingOrder.quantity !== payload.quantity ||
            existingOrder.amountTotal !== payload.amount_total ||
            existingOrder.currency?.toUpperCase() !==
              payload.currency.toUpperCase()
          ) {
            throw new WebhookError(
              "ORDER_MISMATCH",
              "This order already exists with different payment details.",
              422,
            );
          }

          // A different webhook event can refer to the same
          // payment. Do not create a second order or convert
          // another hold.
          await tx.webhookEvent.update({
            where: { id: payload.event_id },
            data: { processedAt: new Date() },
          });

          return {
            received: true,
            duplicate: false,
            event_id: payload.event_id,
            order_status: existingOrder.status,
            note: "The order was already recorded.",
          };
        }

        // Prefer an explicit orderId association. The fallback
        // is safe only when exactly one matching hold exists.
        const matchingHolds = await tx.hold.findMany({
          where: {
            tierId: payload.tier_id,
            quantity: payload.quantity,
            status: HoldStatus.active,
            expiresAt: { gt: new Date() },
            OR: [
              { orderId: payload.order_id },
              { orderId: null },
            ],
          },
          orderBy: { createdAt: "asc" },
          take: 2,
        });

        if (matchingHolds.length !== 1) {
          throw new WebhookError(
            "HOLD_NOT_FOUND",
            "A unique active hold could not be matched to this payment.",
            422,
          );
        }

        const hold = matchingHolds[0];

        await tx.hold.update({
          where: { id: hold.id },
          data: {
            status: HoldStatus.converted,
            orderId: payload.order_id,
          },
        });

        await tx.order.create({
          data: {
            id: payload.order_id,
            tierId: payload.tier_id,
            quantity: payload.quantity,
            amountTotal: payload.amount_total,
            currency: payload.currency.toUpperCase(),
            status: OrderStatus.paid,
          },
        });
      } else {
        // Refund events do not contain tier_id. Serialize by
        // order ID before deciding whether a tier lock is needed.
        let existingOrder = await tx.order.findUnique({
          where: { id: payload.order_id },
        });

        if (!existingOrder) {
          // Tombstone: record the refund before payment arrives.
          // The brief's refund payload lacks the original total,
          // so this mock treats a refund-first event as terminal.
          await tx.order.create({
            data: {
              id: payload.order_id,
              status: OrderStatus.refunded,
              amountRefunded: payload.amount_refunded,
              currency: payload.currency.toUpperCase(),
            },
          });
        } else {
          if (
            existingOrder.currency &&
            existingOrder.currency.toUpperCase() !==
              payload.currency.toUpperCase()
          ) {
            throw new WebhookError(
              "INVALID_REFUND",
              "The refund currency does not match the order.",
              422,
            );
          }

          if (existingOrder.tierId) {
            await lockTier(tx, existingOrder.tierId);

            existingOrder = await tx.order.findUnique({
              where: { id: payload.order_id },
            });

            if (!existingOrder) {
              throw new Error("Order disappeared unexpectedly.");
            }
          }

          if (existingOrder.status !== OrderStatus.refunded) {
            const amountTotal = existingOrder.amountTotal;

            if (amountTotal === null) {
              throw new WebhookError(
                "INVALID_REFUND",
                "The original payment total is unavailable.",
                422,
              );
            }

            if (
              payload.amount_refunded <
              existingOrder.amountRefunded
            ) {
              throw new WebhookError(
                "INVALID_REFUND",
                "The cumulative refund amount cannot decrease.",
                422,
              );
            }

            if (payload.amount_refunded > amountTotal) {
              throw new WebhookError(
                "INVALID_REFUND",
                "The refund cannot exceed the original payment total.",
                422,
              );
            }

            const isFullyRefunded =
              payload.amount_refunded === amountTotal;

            await tx.order.update({
              where: { id: payload.order_id },
              data: {
                amountRefunded: payload.amount_refunded,
                status: isFullyRefunded
                  ? OrderStatus.refunded
                  : OrderStatus.partially_refunded,
              },
            });
          }
        }
      }

      await tx.webhookEvent.update({
        where: { id: payload.event_id },
        data: { processedAt: new Date() },
      });

      return {
        received: true,
        duplicate: false,
        event_id: payload.event_id,
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10000,
      timeout: 15000,
    },
  );
}
