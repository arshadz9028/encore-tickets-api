
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL =
  process.env.TEST_BASE_URL ?? "http://localhost:3000";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let eventId: string;
let tierId: string;

const webhookIds: string[] = [];
const orderIds: string[] = [];

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

function paymentPayload(
  orderId: string,
  eventIdForWebhook: string,
  quantity = 1,
) {
  webhookIds.push(eventIdForWebhook);
  orderIds.push(orderId);

  return {
    event_id: eventIdForWebhook,
    type: "order.paid",
    order_id: orderId,
    tier_id: tierId,
    quantity,
    amount_total: 1500 * quantity,
    currency: "EUR",
    occurred_at: new Date().toISOString(),
  };
}

function refundPayload(
  orderId: string,
  eventIdForWebhook: string,
  amountRefunded: number,
) {
  webhookIds.push(eventIdForWebhook);

  return {
    event_id: eventIdForWebhook,
    type: "order.refunded",
    order_id: orderId,
    amount_refunded: amountRefunded,
    currency: "EUR",
    occurred_at: new Date().toISOString(),
  };
}

async function createHold(quantity = 1) {
  return postJson(`/api/events/${eventId}/holds`, {
    tier_id: tierId,
    quantity,
  });
}

async function sendWebhook(payload: unknown) {
  return postJson("/api/webhooks/payments", payload);
}

beforeAll(async () => {
  // Confirm the test database is reachable before running integration tests.
  await prisma.$connect();
});

beforeEach(async () => {
  eventId = `test_event_${runId}_${Math.random().toString(36).slice(2, 7)}`;
  tierId = `test_tier_${runId}_${Math.random().toString(36).slice(2, 7)}`;

  await prisma.event.create({
    data: {
      id: eventId,
      title: "Automated Test Event",
      venue: "Test Venue",
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.tier.create({
    data: {
      id: tierId,
      eventId,
      name: "Student",
      price: 1500,
      currency: "EUR",
      totalInventory: 1,
    },
  });
});

afterAll(async () => {
  // Delete only records created by this test run.
  await prisma.webhookEvent.deleteMany({
    where: { id: { in: webhookIds } },
  });

  await prisma.order.deleteMany({
    where: {
      OR: [
        { id: { in: orderIds } },
        { tierId: { startsWith: "test_tier_" } },
      ],
    },
  });

  await prisma.hold.deleteMany({
    where: { tierId: { startsWith: "test_tier_" } },
  });

  await prisma.tier.deleteMany({
    where: { id: { startsWith: "test_tier_" } },
  });

  await prisma.event.deleteMany({
    where: { id: { startsWith: "test_event_" } },
  });

  await prisma.$disconnect();
});

describe("Inventory and payment webhook integration", () => {
  it("processes the same payment webhook only once", async () => {
    const holdResponse = await createHold();
    expect(holdResponse.status).toBe(201);

    const payload = paymentPayload(
      `test_order_idempotency_${runId}`,
      `test_payment_event_${runId}`,
    );

    const first = await sendWebhook(payload);
    const second = await sendWebhook(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const orderCount = await prisma.order.count({
      where: { id: payload.order_id },
    });

    expect(orderCount).toBe(1);

    const hold = await prisma.hold.findFirst({
      where: { tierId },
    });

    expect(hold?.status).toBe("converted");
  });

  it("allows a new hold after an existing hold has expired", async () => {
    await prisma.hold.create({
      data: {
        tierId,
        quantity: 1,
        status: "active",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await createHold();

    expect(response.status).toBe(201);

    const activeUnexpiredHolds = await prisma.hold.count({
      where: {
        tierId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
    });

    expect(activeUnexpiredHolds).toBe(1);
  });

  it("releases inventory after a full refund", async () => {
    const holdResponse = await createHold();
    expect(holdResponse.status).toBe(201);

    const orderId = `test_order_refund_${runId}`;

    const payment = paymentPayload(
      orderId,
      `test_payment_refund_${runId}`,
    );

    const paidResponse = await sendWebhook(payment);
    expect(paidResponse.status).toBe(200);

    const refund = refundPayload(
      orderId,
      `test_refund_event_${runId}`,
      1500,
    );

    const refundResponse = await sendWebhook(refund);
    expect(refundResponse.status).toBe(200);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(order?.status).toBe("refunded");
    expect(order?.amountRefunded).toBe(1500);

    const replacementHold = await createHold();
    expect(replacementHold.status).toBe(201);
  });

  it("does not change a refunded order to paid when payment arrives late", async () => {
    const orderId = `test_order_refund_first_${runId}`;

    const refund = refundPayload(
      orderId,
      `test_refund_first_event_${runId}`,
      1500,
    );

    const refundResponse = await sendWebhook(refund);
    expect(refundResponse.status).toBe(200);

    // Create the hold that the late payment webhook can match.
    const holdResponse = await createHold();
    expect(holdResponse.status).toBe(201);

    const payment = paymentPayload(
      orderId,
      `test_late_payment_event_${runId}`,
    );

    const paymentResponse = await sendWebhook(payment);
    expect(paymentResponse.status).toBe(200);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(order?.status).toBe("refunded");
    expect(order?.amountRefunded).toBe(1500);
  });

  it("does not oversell the last ticket under concurrent requests", async () => {
    const results = await Promise.all([
      createHold(),
      createHold(),
    ]);

    const successful = results.filter((result) => result.status === 201);
    const rejected = results.filter((result) => result.status === 409);

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const activeHolds = await prisma.hold.count({
      where: {
        tierId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
    });

    expect(activeHolds).toBe(1);
  });
});
