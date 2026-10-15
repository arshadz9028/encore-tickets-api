
import { HoldStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const HOLD_TTL_MS = 10 * 60 * 1000;

export class HoldError extends Error {
  constructor(
    public readonly code:
      | "EVENT_NOT_FOUND"
      | "TIER_NOT_FOUND"
      | "INVALID_QUANTITY"
      | "INSUFFICIENT_INVENTORY",
    message: string,
    public readonly status: number,
    public readonly available?: number,
  ) {
    super(message);
    this.name = "HoldError";
  }
}

interface LockedTier {
  id: string;
  total_inventory: number;
}

interface InventoryRow {
  total_inventory: number;
  active_hold_quantity: number;
  paid_order_quantity: number;
}

export async function createHold(
  eventId: string,
  tierId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new HoldError(
      "INVALID_QUANTITY",
      "Quantity must be an integer between 1 and 100.",
      400,
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // Lock the tier row. Every hold creation for this tier
      // must acquire this lock before checking availability.
      const tiers = await tx.$queryRaw<LockedTier[]>(
        Prisma.sql`
          SELECT id, total_inventory
          FROM tiers
          WHERE id = ${tierId}
            AND event_id = ${eventId}
          FOR UPDATE
        `,
      );

      if (tiers.length === 0) {
        const event = await tx.event.findUnique({
          where: { id: eventId },
          select: { id: true },
        });

        if (!event) {
          throw new HoldError(
            "EVENT_NOT_FOUND",
            "The requested event does not exist.",
            404,
          );
        }

        throw new HoldError(
          "TIER_NOT_FOUND",
          "The requested tier does not belong to this event.",
          404,
        );
      }

      // Mark expired holds as expired using the database clock.
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE holds
          SET status = 'expired',
              updated_at = NOW()
          WHERE tier_id = ${tierId}
            AND status = 'active'
            AND expires_at <= NOW()
        `,
      );

      // Recalculate inventory after acquiring the tier lock.
      const rows = await tx.$queryRaw<InventoryRow[]>(
        Prisma.sql`
          SELECT
            t.total_inventory,
            COALESCE((
              SELECT SUM(h.quantity)
              FROM holds h
              WHERE h.tier_id = t.id
                AND h.status = 'active'
                AND h.expires_at > NOW()
            ), 0)::int AS active_hold_quantity,
            COALESCE((
              SELECT SUM(o.quantity)
              FROM orders o
              WHERE o.tier_id = t.id
                AND o.status = 'paid'
            ), 0)::int AS paid_order_quantity
          FROM tiers t
          WHERE t.id = ${tierId}
        `,
      );

      const inventory = rows[0];

      if (!inventory) {
        throw new Error("Locked tier disappeared unexpectedly.");
      }

      const available =
        inventory.total_inventory -
        inventory.active_hold_quantity -
        inventory.paid_order_quantity;

      if (quantity > available) {
        throw new HoldError(
          "INSUFFICIENT_INVENTORY",
          `Only ${Math.max(0, available)} ticket(s) are available.`,
          409,
          Math.max(0, available),
        );
      }

      const hold = await tx.hold.create({
        data: {
          tierId,
          quantity,
          expiresAt: new Date(Date.now() + HOLD_TTL_MS),
          status: HoldStatus.active,
        },
        select: {
          id: true,
          tierId: true,
          quantity: true,
          expiresAt: true,
          status: true,
        },
      });

      return {
        hold_id: hold.id,
        tier_id: hold.tierId,
        quantity: hold.quantity,
        expires_at: hold.expiresAt.toISOString(),
        status: hold.status,
      };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
