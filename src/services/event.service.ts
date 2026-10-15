/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/event.service.ts
// Event service - business logic for events

import { prisma } from '../lib/prisma'
import { AppError } from '../lib/errors'

export class EventService {
  /**
   * Get an event by ID
   * @param eventId - The event ID
   */
  async getEventById(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new AppError('Event not found', 404)
    }

    return event
  }

  /**
   * Get events with optional filtering
   * @param filters - Filter options (e.g., date range, venue)
   */
  async getEvents(filters: {
    startDateFrom?: Date
    startDateTo?: Date
    venue?: string
  }) {
    const where: any = {}

    if (filters.startDateFrom) {
      where.startsAt = { gte: filters.startDateFrom }
    }
    if (filters.startDateTo) {
      where.startsAt = { ...where.startsAt, lte: filters.startDateTo }
    }
    if (filters.venue) {
      where.venue = filters.venue
    }

    return await prisma.event.findMany({
      where,
      orderBy: { startsAt: 'asc' },
    })
  }

  /**
   * Create a new event
   * @param data - Event data
   */
  async createEvent(data: {
    title: string
    description?: string
    startDate: Date
    endDate: Date
    venue: string
  }) {
    return await prisma.event.create({
       data: {
    id: crypto.randomUUID(),
    title: data.title,
    venue: data.venue,
    startsAt: data.startDate,
  },
    })
  }

  /**
   * Update an event
   * @param eventId - The event ID
   * @param data - Update data
   */
  async updateEvent(eventId: string, data: Partial<{
    title: string
    description?: string
    startDate: Date
    endDate: Date
    venue: string
  }>) {
    const event = await prisma.event.update({
      where: { id: eventId },
      data,
    })

    return event
  }

  /**
   * Delete an event
   * @param eventId - The event ID
   */
  async deleteEvent(eventId: string) {
    return await prisma.event.delete({
      where: { id: eventId },
    })
  }
}