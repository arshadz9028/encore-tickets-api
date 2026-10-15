
import { NextResponse } from "next/server";
import { createHoldSchema } from "@/lib/validation";
import {
  createHold,
  HoldError,
} from "@/services/hold.service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ event_id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const { event_id } = await context.params;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Request body must contain valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const parsed = createHoldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "The request body is invalid.",
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 },
      );
    }

    const hold = await createHold(
      event_id,
      parsed.data.tier_id,
      parsed.data.quantity,
    );

    return NextResponse.json(hold, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof HoldError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.available !== undefined
              ? { available: error.available }
              : {}),
          },
        },
        { status: error.status },
      );
    }

    console.error("POST create hold failed:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to create the ticket hold.",
        },
      },
      { status: 500 },
    );
  }
}
