
import { NextResponse } from "next/server";
import {
  cancelHold,
  CancelHoldError,
} from "@/services/order.service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ order_id: string }>;
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { order_id } = await context.params;

    if (!order_id.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_ORDER_ID",
            message: "A hold or order ID is required.",
          },
        },
        { status: 400 },
      );
    }

    const result = await cancelHold(order_id);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof CancelHoldError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    console.error("POST cancel hold failed:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to cancel the hold.",
        },
      },
      { status: 500 },
    );
  }
}
