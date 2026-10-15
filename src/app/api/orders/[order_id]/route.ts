
import { HoldStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CancelHoldError } from "@/services/order.service";
// export class CancelHoldError extends Error {
//   constructor(
//     public readonly code:
//       | "HOLD_NOT_FOUND"
//       | "HOLD_ALREADY_CONVERTED",
//     message: string,
//     public readonly status: number,
//   ) {
//     super(message);
//     this.name = "CancelHoldError";
//   }
// }

interface HoldReference {
  id: string;
  tierId: string;
}

export async function cancelHold(reference: string) {
  return prisma.$transaction(
    async (tx) => {
      // Resolve the supplied identifier to a hold.
      // `id` supports the demo; `orderId` supports the external order ID.
      const initialHold = await tx.hold.findFirst({
        where: {
          OR: [
            { id: reference },
            { orderId: reference },
          ],
        },
        select: {
          id: true,
          tierId: true,
        },
      });

      if (!initialHold) {
        throw new CancelHoldError(
          "HOLD_NOT_FOUND",
          "No hold was found for this hold or order ID.",
          404,
        );
      }

      // Serialize cancellation with hold creation and payment
      // transitions for this ticket tier.
      const lockedTiers = await tx.$queryRaw<HoldReference[]>(
        Prisma.sql`
          SELECT id, event_id AS "tierId"
          FROM tiers
          WHERE id = ${initialHold.tierId}
          FOR UPDATE
        `,
      );

      if (lockedTiers.length === 0) {
        throw new Error("The hold's tier no longer exists.");
      }

      // Re-read after acquiring the lock. Another transaction
      // may have converted or expired the hold while we waited.
      const hold = await tx.hold.findUnique({
        where: { id: initialHold.id },
      });

      if (!hold) {
        throw new CancelHoldError(
          "HOLD_NOT_FOUND",
          "The hold no longer exists.",
          404,
        );
      }

      if (hold.status === HoldStatus.converted) {
        throw new CancelHoldError(
          "HOLD_ALREADY_CONVERTED",
          "This hold has already been converted to a paid order.",
          409,
        );
      }

      if (
        hold.status === HoldStatus.expired ||
        hold.expiresAt.getTime() <= Date.now()
      ) {
        if (hold.status === HoldStatus.active) {
          await tx.hold.update({
            where: { id: hold.id },
            data: { status: HoldStatus.expired },
          });
        }

        return {
          hold_id: hold.id,
          status: HoldStatus.expired,
          message: "The hold has already expired.",
        };
      }

      const updated = await tx.hold.updateMany({
        where: {
          id: hold.id,
          status: HoldStatus.active,
        },
        data: {
          status: HoldStatus.expired,
        },
      });

      if (updated.count !== 1) {
        throw new Error("Hold state changed unexpectedly.");
      }

      return {
        hold_id: hold.id,
        status: HoldStatus.expired,
        message: "The hold was cancelled and inventory released.",
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
