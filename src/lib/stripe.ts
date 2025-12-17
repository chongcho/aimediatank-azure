import Stripe from 'stripe'

// Check if Stripe secret key is configured
const stripeSecretKey = process.env.STRIPE_SECRET_KEY

// Server-side Stripe instance - create it dynamically
let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2023-10-16',
      typescript: true,
    })
  }
  return stripeInstance
}

// Legacy export for backwards compatibility
export const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    })
  : null

// Helper to check if Stripe is properly configured
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

// Helper to format amount for Stripe (converts dollars to cents)
export function formatAmountForStripe(amount: number): number {
  return Math.round(amount * 100)
}

// Helper to format amount from Stripe (converts cents to dollars)
export function formatAmountFromStripe(amount: number): number {
  return amount / 100
}






