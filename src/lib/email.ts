// Email service using Azure Communication Services Email
import { EmailClient } from '@azure/communication-email'

interface EmailOptions {
  to: string
  subject: string
  html: string
  /** Optional plain-text version of the email body (improves deliverability). */
  plainText?: string
  replyTo?: string
  /** Display name shown alongside the sender address (configured via AZURE_EMAIL_SENDER_NAME env var by default). */
  fromName?: string
  /** Override the default sender address (must be a verified MailFrom in Azure). */
  senderAddress?: string
}

const CONNECTION_STRING = process.env.AZURE_EMAIL_CONNECTION_STRING || ''
const SENDER_ADDRESS = process.env.AZURE_EMAIL_SENDER || ''
const DEFAULT_SENDER_NAME = process.env.AZURE_EMAIL_SENDER_NAME || 'AI Media Tank'

let cachedClient: EmailClient | null = null

function getClient(): EmailClient | null {
  if (!CONNECTION_STRING) {
    console.error('Azure Email not configured. Set AZURE_EMAIL_CONNECTION_STRING environment variable.')
    return null
  }
  if (!SENDER_ADDRESS) {
    console.error('Azure Email sender not configured. Set AZURE_EMAIL_SENDER environment variable.')
    return null
  }
  if (!cachedClient) {
    cachedClient = new EmailClient(CONNECTION_STRING)
  }
  return cachedClient
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const client = getClient()
  if (!client) return false

  try {
    const senderAddress = options.senderAddress || SENDER_ADDRESS
    const displayName = options.fromName || DEFAULT_SENDER_NAME

    const plainText = options.plainText || options.html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()

    const poller = await client.beginSend({
      senderAddress,
      recipients: {
        to: [{ address: options.to, displayName: '' }],
      },
      content: {
        subject: options.subject,
        html: options.html,
        plainText,
      },
      headers: {
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN',
      },
      ...(options.replyTo
        ? { replyTo: [{ address: options.replyTo, displayName }] }
        : { replyTo: [{ address: 'support@aimediatank.com', displayName: 'AiMediaTank Support' }] }
      ),
    })

    const result = await poller.pollUntilDone()

    if (result.status === 'Succeeded') {
      console.log(`Email sent to ${options.to}: ${options.subject}`)
      return true
    }

    console.error(`Email send failed with status ${result.status}:`, result.error)
    return false
  } catch (error: unknown) {
    console.error('Email send failed:', error instanceof Error ? error.message : error)
    if (error instanceof Error && (error.message.includes('connect') || error.message.includes('auth'))) {
      cachedClient = null
    }
    return false
  }
}

// Celebration card e-card email (clickable thumbnail, optional message, reply-to footer)
export function generateCelebrationCardEmail(options: {
  senderName: string
  senderEmail?: string
  subject?: string
  mediaPageUrl: string
  mediaTitle: string
  thumbnailUrl: string | null
  message?: string
}): { html: string; plainText: string } {
  const { senderName, senderEmail, subject, mediaPageUrl, mediaTitle, thumbnailUrl, message } = options

  const imgBlock = thumbnailUrl
    ? `<a href="${escapeHtml(mediaPageUrl)}" style="display:inline-block;margin:0;"><img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(mediaTitle)}" width="400" style="width:100%;max-width:400px;height:auto;display:block;border:1px solid #e0e0e0;" /></a>`
    : `<a href="${escapeHtml(mediaPageUrl)}" style="display:inline-block;margin:16px 0;color:#00ff88;font-weight:bold;">View media</a>`

  const messageBlock = message
    ? `<p style="font-size:16px;color:#444444;margin:16px 0;line-height:1.6;">${escapeHtml(message)}</p>`
    : ''

  const html = [
    '<!DOCTYPE html>',
    '<html xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#ffffff;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">',
    '<tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.6;color:#333333;">',
    '<tr><td style="padding:20px;">',
    messageBlock,
    '\n<p style="font-size:14px;color:#555555;margin:0 0 12px 0;">Click the image/link below to view the media:</p>\n',
    imgBlock,
    '\n',
    senderEmail ? `<p style="font-size:14px;color:#666666;margin:16px 0 0 0;">Reply to ${escapeHtml(senderName)} at <a href="mailto:${encodeURI(senderEmail)}${subject ? `?subject=${encodeURIComponent('Re: ' + subject)}&body=${encodeURIComponent('Hi ' + senderName + ',\n\nThank you for the celebration card!\n\n')}` : ''}" style="color:#0066cc;">${escapeHtml(senderEmail)}</a></p>\n` : '',
    `<p style="font-size:14px;color:#666666;margin:24px 0 0 0;">Sincerely,<br />\n<strong>${escapeHtml(senderName)}</strong><br />\n<a href="https://www.aimediatank.com" style="color:#0066cc;">www.aimediatank.com</a></p>`,
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n')

  const plainText = [
    message ? `${message}\n\n` : '',
    'Click the image/link below to view the media:\n',
    mediaPageUrl,
    senderEmail ? `\n\nReply to ${senderName}: ${senderEmail}` : '',
    '\n\nSincerely,\n',
    senderName,
    '\nhttps://www.aimediatank.com',
  ].filter(Boolean).join('')

  return { html, plainText }
}

// Share media by email: clickable thumbnail (hyperlinks to media page so video can be played)
export function generateShareMediaEmail(options: {
  senderName: string
  senderEmail?: string
  mediaTitle: string
  mediaPageUrl: string
  thumbnailUrl: string | null
  message?: string
}): { html: string; plainText: string } {
  const { senderName, senderEmail, mediaTitle, mediaPageUrl, thumbnailUrl, message } = options

  const thumbnailBlock = thumbnailUrl
    ? `<a href="${escapeHtml(mediaPageUrl)}" style="display:inline-block;margin:0;"><img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(mediaTitle)}" width="400" style="width:100%;max-width:400px;height:auto;display:block;border:1px solid #e0e0e0;" /></a>`
    : `<a href="${escapeHtml(mediaPageUrl)}" style="color:#00ff88;font-weight:bold;">View: ${escapeHtml(mediaTitle)}</a>`

  const messageBlock = message
    ? `<p style="font-size:16px;color:#444444;margin:16px 0;line-height:1.6;">${escapeHtml(message)}</p>`
    : ''

  const replyBlock = senderEmail
    ? `<p style="font-size:14px;color:#666666;margin:16px 0 0 0;">Click <a href="mailto:${encodeURI(senderEmail)}?subject=${encodeURIComponent('Re: ' + senderName + ' shared this for you!')}&body=${encodeURIComponent('Hi ' + senderName + ',\n\n')}" style="color:#0066cc;">${escapeHtml(senderEmail)}</a> to reply to ${escapeHtml(senderName)}</p>`
    : ''

  const html = [
    '<!DOCTYPE html>',
    '<html xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#ffffff;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">',
    '<tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.6;color:#333333;">',
    '<tr><td style="padding:20px;">',
    messageBlock,
    '\n<p style="font-size:14px;color:#555555;margin:0 0 12px 0;">Click the image/link below to view the media:</p>\n',
    thumbnailBlock,
    '\n',
    replyBlock,
    replyBlock ? '\n' : '',
    `<p style="font-size:14px;color:#666666;margin:24px 0 0 0;">Sincerely,<br />\n<strong>${escapeHtml(senderName)}</strong><br />\n<a href="https://www.aimediatank.com" style="color:#0066cc;">www.aimediatank.com</a></p>`,
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n')

  const plainText = [
    message ? `${message}\n\n` : '',
    'Click the image/link below to view the media:\n',
    mediaPageUrl,
    senderEmail ? `\n\nClick ${senderEmail} to reply to ${senderName}.` : '',
    '\n\nSincerely,\n',
    senderName,
    '\nhttps://www.aimediatank.com',
  ].filter(Boolean).join('')

  return { html, plainText }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Generate purchase confirmation email
export function generatePurchaseEmail(
  buyerName: string,
  itemCount: number,
  items: Array<{ title: string; price: number }>
): string {
  const itemsList = items
    .map(item => `<li style="margin-bottom: 8px;">${escapeHtml(item.title)} - $${item.price.toFixed(2)}</li>`)
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎉 Purchase Confirmed!</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${buyerName},</p>
  
  <p style="font-size: 16px;">Thank you for your purchase! Your items are now available for download.</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff6b6b;">
    <p style="margin: 0 0 10px 0; font-weight: bold; color: #ff6b6b;">⚠️ Important: Download Required</p>
    <p style="margin: 0; font-size: 14px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. <strong>Purchased items will be permanently deleted 10 days after the purchase date.</strong></p>
  </div>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Your Purchased Items:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${itemsList}
  </ul>
  
  <p style="font-size: 16px;">You currently have <strong>${itemCount} item${itemCount > 1 ? 's' : ''}</strong> that require${itemCount === 1 ? 's' : ''} your action to avoid losing access to your content.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/profile" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Download My Purchases
    </a>
  </div>
  
  <p style="font-size: 16px;">Please review your items in <strong>My Contents → Purchased</strong> and take the necessary actions.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
  
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    This email was sent because you made a purchase on AI Media Tank. If you have any questions, please contact our support team.
  </p>
</body>
</html>
`
}

// Generate email verification email
export function generateVerificationEmail(
  userName: string,
  verificationUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">✉️ Verify Your Email</h1>
  </div>
  
  <p style="font-size: 16px;">Hello ${userName},</p>
  
  <p style="font-size: 16px;">Thank you for registering with AI Media Tank! Please verify your email address by clicking the button below:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${verificationUrl}" style="display: inline-block; background-color: #00cc66; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none;">
      Verify Email Address
    </a>
  </div>
  
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 12px; color: #0066cc; word-break: break-all;">${verificationUrl}</p>
  
  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #666;">
      ⏰ This link will expire in <strong>24 hours</strong>.
    </p>
  </div>
  
  <p style="font-size: 14px; color: #666;">If you didn't create an account with AI Media Tank, you can safely ignore this email.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
  
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    This email was sent because someone registered with this email address on AI Media Tank.
  </p>
</body>
</html>
`
}

// Generate membership purchase confirmation email
export function generateMembershipPurchaseEmail(
  userName: string,
  planName: string,
  price: string,
  billingPeriod: string,
  uploadCondition: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎉 Membership Activated!</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Thank you for subscribing to AI Media Tank! Your membership is now active.</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Membership Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Plan:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Price:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${price}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Billing:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${billingPeriod}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Upload Benefits:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #0f8;">${uploadCondition}</td>
      </tr>
    </table>
  </div>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">What's Included:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    <li style="margin-bottom: 8px;">✓ View all contents</li>
    <li style="margin-bottom: 8px;">✓ Buy contents from creators</li>
    <li style="margin-bottom: 8px;">✓ Sell your own contents</li>
    <li style="margin-bottom: 8px;">✓ ${uploadCondition}</li>
  </ul>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/upload" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Start Uploading
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
  
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    You can manage your subscription anytime from the Membership page.
  </p>
</body>
</html>
`
}

// Generate free uploads exhausted notification email
export function generateUploadLimitEmail(
  userName: string,
  planName: string,
  totalUploads: number,
  freeUploads: number,
  uploadCost: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">📊 Upload Summary</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">You've used all your free uploads for this month. Here's your upload summary:</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Upload Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Current Plan:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Free Uploads Used:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${freeUploads} / ${freeUploads}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Total Uploads:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalUploads}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Cost per Upload:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #ffa500;">${uploadCost}</td>
      </tr>
    </table>
  </div>
  
  <p style="font-size: 16px;">Future uploads will be charged at <strong>${uploadCost}</strong> per upload.</p>
  
  <div style="background: #f0fff0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <p style="margin: 0; font-size: 14px;">
      💡 <strong>Tip:</strong> Upgrade to Premium Plan for unlimited free uploads!
    </p>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Upgrade Plan
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate warning notification email
export function generateWarningEmail(
  userName: string,
  warningReason: string,
  warningCount: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">⚠️ Account Warning</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Your account has received a warning from the AI Media Tank moderation team.</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Reason for Warning:</p>
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${warningReason}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px;">
      <strong>Total Warnings:</strong> ${warningCount}
    </p>
  </div>
  
  <p style="font-size: 16px;">Please review our <a href="https://www.aimediatank.com/policy" style="color: #0066cc;">Community Guidelines</a> to ensure your account remains in good standing. Continued violations may result in account suspension.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
  
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    If you believe this warning was issued in error, please contact our support team.
  </p>
</body>
</html>
`
}

// Generate suspension notification email
export function generateSuspensionEmail(
  userName: string,
  suspendReason: string,
  suspendedUntil: Date | null
): string {
  const duration = suspendedUntil 
    ? `until ${suspendedUntil.toLocaleDateString()}` 
    : 'permanently'
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ff4444; margin: 0; font-size: 24px;">🚫 Account Suspended</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Your AI Media Tank account has been suspended ${duration}.</p>
  
  <div style="background: #fff0f0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff4444;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Reason for Suspension:</p>
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${suspendReason}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px;">
      <strong>Suspension Duration:</strong> ${suspendedUntil ? `Until ${suspendedUntil.toLocaleDateString()} at ${suspendedUntil.toLocaleTimeString()}` : 'Permanent'}
    </p>
  </div>
  
  <p style="font-size: 16px;">While suspended, you will not be able to:</p>
  <ul style="font-size: 16px; color: #666;">
    <li>Upload new content</li>
    <li>Make purchases</li>
    <li>Participate in chat</li>
  </ul>
  
  <p style="font-size: 16px;">If you believe this suspension was issued in error, please contact our support team at <a href="mailto:support@aimediatank.com" style="color: #0066cc;">support@aimediatank.com</a>.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate unsuspension notification email
export function generateUnsuspensionEmail(
  userName: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">✅ Account Reinstated</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Good news! Your AI Media Tank account has been reinstated and is now fully active.</p>
  
  <div style="background: #f0fff0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <p style="margin: 0; font-size: 16px;">Your account access has been restored. You can now:</p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
      <li>Upload new content</li>
      <li>Make purchases</li>
      <li>Participate in chat</li>
    </ul>
  </div>
  
  <p style="font-size: 16px;">Please continue to follow our <a href="https://www.aimediatank.com/policy" style="color: #0066cc;">Community Guidelines</a> to keep your account in good standing.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Go to AI Media Tank
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate bonus credits notification email
export function generateBonusCreditsEmail(
  userName: string,
  credits: number,
  totalCredits: number,
  reason?: string
): string {
  const hasCustomReason = reason && reason !== 'Admin bonus credits'
  const headerTitle = hasCustomReason ? reason : 'You Received Bonus Credits!'
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎁 ${headerTitle}</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Great news! You've received bonus upload credits from AI Media Tank.</p>
  
  <div style="background: #f0fff0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8; text-align: center;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Credits Received</p>
    <p style="margin: 0; font-size: 48px; font-weight: bold; color: #0f8;">+${credits}</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Credits Added:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #0f8;">+${credits}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Total Credits:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalCredits}</td>
      </tr>${hasCustomReason ? `
      <tr>
        <td style="padding: 8px 0; color: #666;">Reason:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${reason}</td>
      </tr>` : ''}
    </table>
  </div>
  
  <p style="font-size: 16px;">Each credit allows you to upload one piece of content without additional charges. Start uploading your AI-generated media today!</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/upload" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Upload Now
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
  
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    This email was sent because you received bonus credits on AI Media Tank. If you have any questions, please contact our support team.
  </p>
</body>
</html>
`
}

// Generate download reminder email (can be used by a cron job)
export function generateDownloadReminderEmail(
  buyerName: string,
  itemCount: number,
  daysRemaining: number,
  items: Array<{ title: string; daysLeft: number }>
): string {
  const itemsList = items
    .map(item => `<li style="margin-bottom: 8px;">${escapeHtml(item.title)} - <span style="color: #ff6b6b; font-weight: bold;">${item.daysLeft} days left</span></li>`)
    .join('')

  const urgencyColor = daysRemaining <= 2 ? '#ff0000' : daysRemaining <= 5 ? '#ff6b6b' : '#ffa500'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: ${urgencyColor}; margin: 0; font-size: 24px;">⏰ Download Reminder</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${buyerName},</p>
  
  <div style="background: #fff3f3; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid ${urgencyColor};">
    <p style="margin: 0; font-size: 16px; color: ${urgencyColor}; font-weight: bold;">
      ⚠️ Your purchased items will be deleted in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}!
    </p>
  </div>
  
  <p style="font-size: 16px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. Purchased items will be permanently deleted 10 days after the purchase date.</p>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Items Requiring Download:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${itemsList}
  </ul>
  
  <p style="font-size: 16px;">You currently have <strong>${itemCount} item${itemCount > 1 ? 's' : ''}</strong> that require${itemCount === 1 ? 's' : ''} your action to avoid losing access to your data.</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/profile" style="display: inline-block; background: linear-gradient(135deg, #ff6b6b 0%, #ff0000 100%); color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Download Now
    </a>
  </div>
  
  <p style="font-size: 16px;">Please review your items in <strong>My Contents → Purchased</strong> and take the necessary actions.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate account deleted notification email
export function generateAccountDeletedEmail(
  userName: string,
  deleteReason: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ff4444; margin: 0; font-size: 24px;">🗑️ Account Deleted</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Your AI Media Tank account has been permanently deleted.</p>
  
  <div style="background: #fff0f0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff4444;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Reason:</p>
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${deleteReason}</p>
  </div>
  
  <p style="font-size: 16px;">All associated data, including:</p>
  <ul style="font-size: 16px; color: #666;">
    <li>Profile information</li>
    <li>Uploaded content</li>
    <li>Purchase history</li>
    <li>Chat messages</li>
  </ul>
  <p style="font-size: 16px;">has been permanently removed from our systems.</p>
  
  <p style="font-size: 16px;">If you believe this deletion was in error, please contact our support team at <a href="mailto:support@aimediatank.com" style="color: #0066cc;">support@aimediatank.com</a>.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate chat warning notification email
export function generateChatWarningEmail(
  userName: string,
  reason: string,
  messageContent?: string,
  warningCount?: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">⚠️ Chat Warning</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">You have received a warning for your chat message on AI Media Tank.</p>
  
  <div style="background: #fff8e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Reason:</p>
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${reason}</p>
  </div>
  
  ${messageContent ? `
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Message in question:</p>
    <p style="margin: 0; font-size: 14px; color: #666; font-style: italic;">"${messageContent.substring(0, 200)}${messageContent.length > 200 ? '...' : ''}"</p>
  </div>
  ` : ''}
  
  ${warningCount ? `
  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px;">
      <strong>Total Warnings:</strong> ${warningCount}
    </p>
  </div>
  ` : ''}
  
  <p style="font-size: 16px;">Please review our <a href="https://www.aimediatank.com/policy" style="color: #0066cc;">Community Guidelines</a> to avoid future warnings. Multiple warnings may result in suspension of your account.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}

// Generate chat message deleted notification email
export function generateChatMessageDeletedEmail(
  userName: string,
  reason: string,
  messageContent?: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ff4444; margin: 0; font-size: 24px;">🗑️ Chat Message Deleted</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${userName},</p>
  
  <p style="font-size: 16px;">Your chat message on AI Media Tank has been deleted by a moderator.</p>
  
  <div style="background: #fff0f0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff4444;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Reason:</p>
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${reason}</p>
  </div>
  
  ${messageContent ? `
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Deleted message:</p>
    <p style="margin: 0; font-size: 14px; color: #666; font-style: italic;">"${messageContent.substring(0, 200)}${messageContent.length > 200 ? '...' : ''}"</p>
  </div>
  ` : ''}
  
  <p style="font-size: 16px;">Please ensure your future messages comply with our <a href="https://www.aimediatank.com/policy" style="color: #0066cc;">Community Guidelines</a>.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`
}
