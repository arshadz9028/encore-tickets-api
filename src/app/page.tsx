
"use client";

import { useEffect, useMemo, useState } from "react";
import "./page.css";

type Tier = {
  id: string;
  name: string;
  price: number;
  currency: string;
  total_inventory?: number;
  totalInventory?: number;
  available?: number;
  available_inventory?: number;
  availableInventory?: number;
};

type EventData = {
  id: string;
  title: string;
  venue?: string;
  tiers?: Tier[];
};

type ApiResult = {
  status: number;
  ok: boolean;
  data: unknown;
};

const API = "/api";

async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<ApiResult> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body
      ? { "Content-Type": "application/json" }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: unknown;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, ok: response.ok, data };
}

function getErrorMessage(data: unknown) {
  if (data && typeof data === "object" && "error" in data) {
    return String((data as { error: unknown }).error);
  }

  return "Request failed. Check the response below.";
}

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(price / 100);
}

export default function HomePage() {
  const [eventId, setEventId] = useState("evt_002");
  const [event, setEvent] = useState<EventData | null>(null);
  const [tierId, setTierId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [holdId, setHoldId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("800");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [notice, setNotice] = useState("");

  const tiers = event?.tiers ?? [];
  const selectedTier = tiers.find((tier) => tier.id === tierId);

  const totalPrice = useMemo(
    () => selectedTier ? selectedTier.price * quantity : 0,
    [selectedTier, quantity],
  );

  const totalInventory = selectedTier?.total_inventory ??
    selectedTier?.totalInventory;

  const available = selectedTier?.available ??
    selectedTier?.available_inventory ??
    selectedTier?.availableInventory;

  async function run(
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    setBusy(true);
    setNotice("");

    try {
      const response = await request(path, method, body);
      setResult(response);

      if (!response.ok) {
        setNotice(getErrorMessage(response.data));
      } else {
        setNotice("Request completed successfully.");
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Network error";

      setResult({
        status: 0,
        ok: false,
        data: { error: message },
      });
      setNotice(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadEvent() {
    if (!eventId.trim()) {
      setNotice("Enter an event ID.");
      return;
    }

    const response = await run(
      `/events/${encodeURIComponent(eventId.trim())}`,
    );

    if (!response?.ok) return;

    const raw = response.data as Record<string, unknown>;
    const source = (raw.event ?? raw) as Record<string, unknown>;

    const rawTiers = (
      raw.tiers ??
      source.tiers ??
      []
    ) as Record<string, unknown>[];

    const parsedTiers: Tier[] = rawTiers.map((tier) => ({
      id: String(tier.id ?? ""),
      name: String(tier.name ?? "Unnamed tier"),
      price: Number(tier.price ?? 0),
      currency: String(tier.currency ?? "EUR"),
      total_inventory: Number(
        tier.total_inventory ?? tier.totalInventory ?? 0,
      ),
      available: Number(
        tier.available ??
        tier.available_inventory ??
        tier.availableInventory ??
        0,
      ),
    }));

    const parsedEvent: EventData = {
      id: String(source.id ?? eventId),
      title: String(source.title ?? "Event details"),
      venue: String(source.venue ?? ""),
      tiers: parsedTiers,
    };

    setEvent(parsedEvent);
    setTierId(parsedTiers[0]?.id ?? "");

    if (parsedTiers[0]) {
      setRefundAmount(String(parsedTiers[0].price));
    }
  }

  useEffect(() => {
    void loadEvent();
    // Load the default event once when the dashboard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTier) {
      setRefundAmount(String(selectedTier.price * quantity));
    }
  }, [selectedTier, quantity]);

  async function createHold() {
    if (!selectedTier) {
      setNotice("Load an event and select a ticket tier first.");
      return;
    }

    const response = await run(
      `/events/${encodeURIComponent(eventId)}/holds`,
      "POST",
      { tier_id: tierId, quantity },
    );

    if (!response?.ok) return;

    const data = response.data as Record<string, unknown>;
    const createdHold = data.hold ?? data;

    const id = createdHold && typeof createdHold === "object"
      ? String(
          (createdHold as Record<string, unknown>).id ??
          (createdHold as Record<string, unknown>).hold_id ??
          (createdHold as Record<string, unknown>).holdId ??
          "",
        )
      : "";

    if (id) setHoldId(id);

    setNotice(
      id
        ? `Hold created: ${id}`
        : "Hold request succeeded. Check the response for its ID.",
    );
  }

  async function cancelHold() {
    const reference = orderId.trim() || holdId.trim();

    if (!reference) {
      setNotice("Enter a hold ID or order ID first.");
      return;
    }

    await run(
      `/orders/${encodeURIComponent(reference)}/cancel-hold`,
      "POST",
    );
  }

  async function sendPayment() {
    if (!selectedTier) {
      setNotice("Load an event and select a ticket tier first.");
      return;
    }

    const id = orderId.trim() || `test_order_${Date.now()}`;
    const webhookId = `test_payment_${Date.now()}`;

    setOrderId(id);

    await run("/webhooks/payments", "POST", {
      event_id: webhookId,
      type: "order.paid",
      order_id: id,
      tier_id: tierId,
      quantity,
      amount_total: totalPrice,
      currency: selectedTier.currency,
      occurred_at: new Date().toISOString(),
    });
  }

  async function sendRefund() {
    if (!orderId.trim()) {
      setNotice("Enter the order ID you want to refund.");
      return;
    }

    await run("/webhooks/payments", "POST", {
      event_id: `test_refund_${Date.now()}`,
      type: "order.refunded",
      order_id: orderId.trim(),
      amount_refunded: Number(refundAmount),
      currency: selectedTier?.currency ?? "EUR",
      occurred_at: new Date().toISOString(),
    });
  }

  async function sendDuplicateWebhook() {
    if (!selectedTier) {
      setNotice("Load an event and select a ticket tier first.");
      return;
    }

    const id = orderId.trim() || `test_order_${Date.now()}`;
    const webhookId = `test_duplicate_${Date.now()}`;

    setOrderId(id);

    const payload = {
      event_id: webhookId,
      type: "order.paid",
      order_id: id,
      tier_id: tierId,
      quantity,
      amount_total: totalPrice,
      currency: selectedTier.currency,
      occurred_at: new Date().toISOString(),
    };

    await run("/webhooks/payments", "POST", payload);

    // Send the exact same event ID and payload again.
    await run("/webhooks/payments", "POST", payload);
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">E</span>
          <span>
            <strong>Encore</strong>
            <small>Ticket inventory API</small>
          </span>
        </a>

        <span className="environment">
          <span className="status-dot" />
          Development
        </span>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">API WORKSPACE</p>
          <h1>Control Center</h1>
          <p className="muted">
            Manage reservations, test payment events, and inspect responses.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={loadEvent}
          disabled={busy}
        >
          ↻ Refresh event
        </button>
      </section>

      <section className="event-panel">
        <div className="event-panel-header">
          <div>
            <p className="eyebrow">CURRENT EVENT</p>
            <h2>{event?.title ?? "Load an event"}</h2>
            <p className="muted">{event?.venue ?? "Event details will appear here"}</p>
          </div>
          <span className="event-badge">Inventory</span>
        </div>

        <form
          className="event-selector"
          onSubmit={(e) => {
            e.preventDefault();
            void loadEvent();
          }}
        >
          <label className="field">
            <span>Event ID</span>
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="evt_002"
              required
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            Get event
          </button>
        </form>

        <div className="tier-grid">
          {tiers.length ? tiers.map((tier) => {
            const isSelected = tier.id === tierId;
            const stock = tier.available ??
              tier.available_inventory ??
              tier.availableInventory;

            return (
              <button
                type="button"
                key={tier.id}
                className={`tier-card ${isSelected ? "tier-selected" : ""}`}
                onClick={() => setTierId(tier.id)}
              >
                <span className="tier-radio">
                  {isSelected ? "✓" : ""}
                </span>
                <strong>{tier.name}</strong>
                <span className="tier-price">
                  {formatPrice(tier.price, tier.currency)}
                </span>
                <span className="muted tier-stock">
                  {stock === undefined
                    ? "Availability not returned"
                    : `${stock} available`}
                </span>
              </button>
            );
          }) : (
            <p className="muted empty-state">
              No ticket tiers loaded. Enter an event ID and click Get event.
            </p>
          )}
        </div>

        {selectedTier && (
          <div className="inventory-summary">
            <div>
              <span className="muted">Total inventory</span>
              <strong>{totalInventory ?? "—"}</strong>
            </div>
            <div>
              <span className="muted">Available</span>
              <strong>{available ?? "—"}</strong>
            </div>
            <div>
              <span className="muted">Selected total</span>
              <strong>{formatPrice(totalPrice, selectedTier.currency)}</strong>
            </div>
          </div>
        )}
      </section>

      <div className="workspace-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 / RESERVATION</p>
              <h2>Create a hold</h2>
            </div>
            <span className="icon-tile">◷</span>
          </div>

          <p className="muted">
            Reserve tickets for 10 minutes while the customer completes payment.
          </p>

          <label className="field">
            <span>Ticket quantity</span>
            <input
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(
                Math.max(1, Math.min(100, Number(e.target.value) || 1)),
              )}
            />
          </label>

          <button
            className="button button-primary button-full"
            onClick={createHold}
            disabled={busy || !selectedTier}
          >
            Create ticket hold →
          </button>

          <label className="field">
            <span>Hold ID returned by API</span>
            <input
              value={holdId}
              onChange={(e) => setHoldId(e.target.value)}
              placeholder="Paste a hold ID"
            />
          </label>

          <label className="field">
            <span>Order ID (optional for cancellation)</span>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="order_123"
            />
          </label>

          <button
            className="button button-danger-outline button-full"
            onClick={cancelHold}
            disabled={busy}
          >
            Cancel hold
          </button>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">02 / PAYMENTS</p>
              <h2>Webhook simulator</h2>
            </div>
            <span className="icon-tile">↗</span>
          </div>

          <p className="muted">
            Send test payment and refund events to your webhook endpoint.
            No real payment is processed.
          </p>

          <label className="field">
            <span>Order ID</span>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter or generate an order ID"
            />
          </label>

          <div className="webhook-preview">
            <div>
              <span className="muted">Event type</span>
              <code>order.paid</code>
            </div>
            <div>
              <span className="muted">Amount</span>
              <strong>
                {selectedTier
                  ? formatPrice(totalPrice, selectedTier.currency)
                  : "Select a tier"}
              </strong>
            </div>
          </div>

          <button
            className="button button-primary button-full"
            onClick={sendPayment}
            disabled={busy || !selectedTier}
          >
            Simulate payment →
          </button>

          <button
            className="button button-secondary button-full"
            onClick={sendDuplicateWebhook}
            disabled={busy || !selectedTier}
          >
            Test duplicate webhook
          </button>

          <label className="field">
            <span>Refund amount (minor units)</span>
            <input
              type="number"
              min={1}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
            <small>For EUR, 800 means €8.00.</small>
          </label>

          <button
            className="button button-danger-outline button-full"
            onClick={sendRefund}
            disabled={busy || !orderId.trim()}
          >
            Simulate refund
          </button>
        </section>
      </div>

      <section className="panel response-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">03 / DEBUGGING</p>
            <h2>Request response</h2>
          </div>
          {result && (
            <span className={`http-status ${result.ok ? "http-ok" : "http-error"}`}>
              {result.status === 0 ? "NETWORK ERROR" : `HTTP ${result.status}`}
            </span>
          )}
        </div>

        {notice && (
          <div className={`notice ${result?.ok ? "notice-success" : "notice-error"}`}>
            {notice}
          </div>
        )}

        <pre className="json-output">
          {result
            ? JSON.stringify(result.data, null, 2)
            : "Run an action to see the API response here."}
        </pre>

        <div className="response-footer">
          <span className="muted">Base URL: same origin as this application</span>
          <button
            className="button button-secondary button-small"
            onClick={() => {
              if (result) {
                void navigator.clipboard.writeText(
                  JSON.stringify(result.data, null, 2),
                );
              }
            }}
            disabled={!result}
          >
            Copy response
          </button>
        </div>
      </section>

      <footer className="footer">
        Encore API Playground <span>•</span> Development tools only
      </footer>
    </main>
  );
}
