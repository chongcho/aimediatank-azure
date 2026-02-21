/**
 * Azure Communication Services (ACS) SMS.
 * Send SMS via Azure when AZURE_ACS_CONNECTION_STRING and AZURE_ACS_SMS_FROM are set.
 */

import { SmsClient } from '@azure/communication-sms'

const connectionString = process.env.AZURE_ACS_CONNECTION_STRING || process.env.COMMUNICATION_SERVICES_CONNECTION_STRING
const fromNumber = process.env.AZURE_ACS_SMS_FROM

export function isAzureSmsConfigured(): boolean {
  return !!(connectionString && fromNumber)
}

/**
 * Format phone to E.164 (e.g. 14255605621 -> +14255605621).
 */
export function toE164(digitsOnly: string): string {
  const d = digitsOnly.replace(/\D/g, '')
  return d ? `+${d}` : ''
}

/**
 * Send an SMS via Azure Communication Services.
 * Returns true if sent successfully, false otherwise.
 */
export async function sendAzureSms(toDigitsOnly: string, message: string): Promise<boolean> {
  if (!connectionString || !fromNumber) {
    console.warn('Azure SMS not configured: AZURE_ACS_CONNECTION_STRING and AZURE_ACS_SMS_FROM required')
    return false
  }

  const to = toE164(toDigitsOnly)
  if (!to || to.length < 10) {
    console.warn('Invalid recipient for SMS:', toDigitsOnly)
    return false
  }

  try {
    const smsClient = new SmsClient(connectionString)
    const results = await smsClient.send(
      {
        from: fromNumber,
        to: [to],
        message,
      },
      {}
    )
    const success = results.every((r) => r.successful)
    if (!success) {
      const failed = results.filter((r) => !r.successful)
      console.error('Azure SMS send failed:', failed)
    }
    return success
  } catch (error) {
    console.error('Azure SMS error:', error)
    return false
  }
}
