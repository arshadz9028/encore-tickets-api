import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ order_id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { order_id } = await context.params;

    const order = await prisma.order.findUnique({
      where: { id: order_id },
    });

    if (!order) {
      return NextResponse.json(
        {
          error: {
            code: "ORDER_NOT_FOUND",
            message: `Order '${order_id}' was not found.`,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(order, { status: 200 });
  } catch (error: unknown) {
    console.error("GET order failed:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to retrieve order.",
        },
      },
      { status: 500 },
    );
  }
}