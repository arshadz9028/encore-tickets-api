/* eslint-disable @typescript-eslint/no-explicit-any */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTierInventory } from "@/lib/inventory";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ event_id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { event_id } = await context.params;

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const event = await tx.event.findUnique({
          where: { id: event_id },
          include: {
            tiers: {
              orderBy: { id: "asc" },
            },
          },
        });

        if (!event) {
          return null;
        }

        const inventory = await getTierInventory(
          tx,
          event.tiers.map((tier: { id: string; }) => tier.id),
        );

        return {
          id: event.id,
          title: event.title,
          venue: event.venue,
          starts_at: event.startsAt.toISOString(),
          tiers: event.tiers.map((tier: { id: string; name: any; price: any; currency: any; totalInventory: any; }) => {
            const tierInventory = inventory.get(tier.id);

            if (!tierInventory) {
              throw new Error(
                `Inventory missing for tier ${tier.id}`,
              );
            }

            return {
              id: tier.id,
              name: tier.name,
              price: tier.price,
              currency: tier.currency,
              total_inventory: tier.totalInventory,
              available_inventory:
                tierInventory.availableInventory,
            };
          }),
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    if (!result) {
      return NextResponse.json(
        {
          error: {
            code: "EVENT_NOT_FOUND",
            message: `Event '${event_id}' was not found.`,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error("GET event failed:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to retrieve event inventory.",
        },
      },
      { status: 500 },
    );
  }
}
