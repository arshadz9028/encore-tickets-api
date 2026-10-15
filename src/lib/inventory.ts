/* eslint-disable @typescript-eslint/no-explicit-any */

import { HoldStatus, OrderStatus, Prisma } from "@prisma/client";

export interface TierInventory {
  tierId: string;
  totalInventory: number;
  activeHoldQuantity: number;
  paidOrderQuantity: number;
  availableInventory: number;
}

export async function getTierInventory(
  tx: Prisma.TransactionClient,
  tierIds: string[],
): Promise<Map<string, TierInventory>> {
  const inventory = new Map<string, TierInventory>();

  if (tierIds.length === 0) {
    return inventory;
  }

  const now = new Date();

  const [tiers, activeHolds, paidOrders] = await Promise.all([
    tx.tier.findMany({
      where: { id: { in: tierIds } },
      select: {
        id: true,
        totalInventory: true,
      },
    }),

    tx.hold.groupBy({
      by: ["tierId"],
      where: {
        tierId: { in: tierIds },
        status: HoldStatus.active,
        expiresAt: { gt: now },
      },
      _sum: {
        quantity: true,
      },
    }),

    tx.order.groupBy({
      by: ["tierId"],
      where: {
        tierId: { in: tierIds },
        status: {
          in: [OrderStatus.paid, OrderStatus.partially_refunded],
        },
      },
      _sum: {
        quantity: true,
      },
    }),
  ]);

  const holdsByTier = new Map(
    activeHolds.map((hold: { tierId: any; _sum: { quantity: any } }) => [
      hold.tierId,
      hold._sum.quantity ?? 0,
    ]),
  );

  const ordersByTier = new Map(
    paidOrders.map((order: { tierId: any; _sum: { quantity: any } }) => [
      order.tierId,
      order._sum.quantity ?? 0,
    ]),
  );

  for (const tier of tiers) {
    const activeHoldQuantity = holdsByTier.get(tier.id) ?? 0;
    const paidOrderQuantity = ordersByTier.get(tier.id) ?? 0;

    inventory.set(tier.id, {
      tierId: tier.id,
      totalInventory: tier.totalInventory,
      activeHoldQuantity,
      paidOrderQuantity,
      availableInventory:
        tier.totalInventory - activeHoldQuantity - paidOrderQuantity,
    });
  }

  return inventory;
}
