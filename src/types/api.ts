// src/types/api.ts
// TypeScript interfaces for API requests and responses

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Event-related types
export interface Event {
  id: string
  title: string
  description?: string
  startDate: string // ISO date string
  endDate: string // ISO date string
  venue: string
  createdAt: string
  updatedAt: string
}

export interface CreateEventRequest {
  title: string
  description?: string
  startDate: string // ISO date string
  endDate: string // ISO date string
  venue: string
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {}

// Hold-related types
export interface Hold {
  id: string
  eventId: string
  seatIds: string[]
  expiresAt: string // ISO date string
  createdAt: string
  updatedAt: string
}

export interface CreateHoldRequest {
  eventId: string
  seatIds: string[]
}

// Order-related types
export interface Order {
  id: string
  eventId: string
  holdId?: string
  status: string // e.g., 'pending', 'confirmed', 'cancelled'
  totalAmount: number
  createdAt: string
  updatedAt: string
}

export interface CreateOrderRequest {
  holdId: string
  paymentDetails: {
    amount: number
    method: string
    // other payment details
  }
}

// Payment-related types
export interface Payment {
  id: string
  orderId: string
  amount: number
  status: string // e.g., 'pending', 'completed', 'failed'
  method: string
  createdAt: string
  updatedAt: string
}

// Webhook types
export interface StripeWebhookEvent {
  id: string
  object: string
  type: string
  data: {
    object: any
  }
  // ... other Stripe webhook properties
}