
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.event.upsert({
    where: { id: "evt_001" },
    update: {
      title: "Anoushka Shankar — Live in Lisbon",
      venue: "Coliseu dos Recreios, Lisboa",
      startsAt: new Date("2026-11-14T20:00:00Z"),
    },
    create: {
      id: "evt_001",
      title: "Anoushka Shankar — Live in Lisbon",
      venue: "Coliseu dos Recreios, Lisboa",
      startsAt: new Date("2026-11-14T20:00:00Z"),
    },
  });

  await prisma.event.upsert({
    where: { id: "evt_002" },
    update: {
      title: "Indie Devs Meetup — Berlin",
      venue: "Festsaal Kreuzberg, Berlin",
      startsAt: new Date("2026-08-22T19:30:00Z"),
    },
    create: {
      id: "evt_002",
      title: "Indie Devs Meetup — Berlin",
      venue: "Festsaal Kreuzberg, Berlin",
      startsAt: new Date("2026-08-22T19:30:00Z"),
    },
  });

  const tiers = [
    {
      id: "tier_001_a",
      eventId: "evt_001",
      name: "Front Stalls",
      price: 8500,
      currency: "EUR",
      totalInventory: 50,
    },
    {
      id: "tier_001_b",
      eventId: "evt_001",
      name: "General Standing",
      price: 4500,
      currency: "EUR",
      totalInventory: 200,
    },
    {
      id: "tier_001_c",
      eventId: "evt_001",
      name: "Balcony",
      price: 3000,
      currency: "EUR",
      totalInventory: 100,
    },
    {
      id: "tier_002_a",
      eventId: "evt_002",
      name: "Standard",
      price: 1500,
      currency: "EUR",
      totalInventory: 80,
    },
    {
      id: "tier_002_b",
      eventId: "evt_002",
      name: "Student",
      price: 800,
      currency: "EUR",
      totalInventory: 20,
    },
  ] as const;

  for (const tier of tiers) {
    await prisma.tier.upsert({
      where: { id: tier.id },
      update: {
        name: tier.name,
        price: tier.price,
        currency: tier.currency,
        totalInventory: tier.totalInventory,
        eventId: tier.eventId,
      },
      create: tier,
    });
  }

  console.log("Successfully seeded 2 events and 5 ticket tiers.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
