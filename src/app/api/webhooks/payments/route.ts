
import { NextResponse } from "next/server";
import { webhookSchema } from "@/lib/webhook-validation";
import {
  processPaymentWebhook,
  WebhookError,
} from "@/services/webhook.service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
): Promise<NextResponse> {
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

  const parsed = webhookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_WEBHOOK",
          message: "The webhook payload is invalid.",
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await processPaymentWebhook(parsed.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof WebhookError) {
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

    // A failed transaction must not acknowledge the webhook.
    // The processor can retry with the same event ID.
    console.error("Payment webhook failed:", error);

    return NextResponse.json(
      {
        error: {
          code: "WEBHOOK_PROCESSING_FAILED",
          message: "The webhook could not be processed.",
        },
      },
      { status: 500 },
    );
  }
}
