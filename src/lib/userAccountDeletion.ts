import { prisma } from '@/lib/prisma'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export type DeleteUserAccountOptions = {
  sendEmail?: boolean
  reason?: string
}

/** Permanently delete a user and cancel an active Stripe subscription when configured. */
export async function deleteUserAccountPermanently(
  userId: string,
  options: DeleteUserAccountOptions = {},
): Promise<{ emailSent: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      stripeSubscriptionId: true,
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  if (user.stripeSubscriptionId && isStripeConfigured()) {
    try {
      const stripe = getStripe()
      await stripe.subscriptions.cancel(user.stripeSubscriptionId)
    } catch (error) {
      console.error('Stripe subscription cancel on account delete:', error)
    }
  }

  let emailSent = false
  const shouldSendEmail = options.sendEmail !== false
  if (shouldSendEmail && user.email) {
    try {
      const { sendEmail, generateAccountDeletedEmail } = await import('@/lib/email')
      emailSent = await sendEmail({
        to: user.email,
        subject: '🗑️ Your AI Media Tank (AMT) Account Has Been Deleted',
        html: generateAccountDeletedEmail(
          user.username || 'User',
          options.reason || 'Account deleted at your request',
        ),
      })
    } catch (error) {
      console.error('Failed to send account deletion email:', error)
    }
  }

  await prisma.user.delete({ where: { id: userId } })

  return { emailSent }
}
