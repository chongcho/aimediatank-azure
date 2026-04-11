/** HTML bodies for upload-related user emails — shared by /api/upload/complete, Stripe webhook, and deferred video notifications */

export function generateUploadConfirmationEmail(
  userName: string,
  mediaTitle: string,
  uploadNumber: number,
  freeUploadsRemaining: number | string,
  isFreeUpload: boolean,
  uploadCost: number,
  planName: string
): string {
  const remainingText =
    freeUploadsRemaining === 'Unlimited' ? 'Unlimited' : `${freeUploadsRemaining} remaining`

  const costSection = isFreeUpload
    ? `<p style="color: #0f8; font-weight: bold;">✅ This was a FREE upload!</p>`
    : `<p style="color: #ffa500; font-weight: bold;">💳 Upload cost: $${uploadCost.toFixed(2)}</p>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎬 Upload Successful!</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your content "<strong>${mediaTitle}</strong>" has been uploaded successfully!</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Upload Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Plan:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Upload #:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${uploadNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Free Uploads:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${remainingText}</td>
      </tr>
    </table>
    ${costSection}
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Your Content
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank (AiM) Team</strong>
  </p>
</body>
</html>
  `
}

export function generateFreeUploadsExhaustedEmail(
  userName: string,
  planName: string,
  costPerUpload: number
): string {
  const nextStepSection =
    costPerUpload > 0
      ? `<p style="font-size: 16px;">Future uploads will cost <strong>$${costPerUpload.toFixed(2)} per upload</strong>.</p>
       <p style="font-size: 16px;">Consider upgrading to <strong>Premium Plan</strong> for unlimited free uploads!</p>`
      : `<p style="font-size: 16px;">You've reached the upload limit for your plan. <strong>Upgrade now</strong> to continue uploading!</p>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">⚠️ Free Uploads Exhausted</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">You've used all <strong>5 free uploads</strong> included with your <strong>${planName}</strong>.</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    ${nextStepSection}
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Plans
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank (AiM) Team</strong>
  </p>
</body>
</html>
  `
}

export function generatePaidUploadEmail(
  userName: string,
  mediaTitle: string,
  uploadCost: number,
  totalPaidUploads: number,
  totalCost: number
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
    <h1 style="color: #ffa500; margin: 0; font-size: 24px;">💳 Paid Upload Processed</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your paid upload "<strong>${mediaTitle}</strong>" has been processed.</p>
  
  <div style="background: #fff8e6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffa500;">
    <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Upload Charge</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">This Upload:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">$${uploadCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Paid Uploads This Period:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalPaidUploads}</td>
      </tr>
      <tr style="border-top: 1px solid #ddd;">
        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Charges:</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #ffa500;">$${totalCost.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <p style="font-size: 14px; color: #666;">
    💡 <strong>Tip:</strong> Upgrade to Premium for unlimited free uploads and save on upload costs!
  </p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Upgrade to Premium
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank (AiM) Team</strong>
  </p>
</body>
</html>
  `
}

export function generateStripeUploadFeeCompleteEmail(
  userName: string,
  title: string,
  mediaType: string,
  uploadCost: number,
  mediaId: string
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
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎉 Upload Complete!</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your paid upload has been successfully processed and is now live!</p>
  
  <div style="background: #f0fff0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <p style="margin: 0 0 10px 0; font-weight: bold; color: #0f8;">Upload Summary:</p>
    <ul style="list-style: none; padding: 0; margin: 0;">
      <li style="margin-bottom: 8px;"><strong>Title:</strong> ${title}</li>
      <li style="margin-bottom: 8px;"><strong>Type:</strong> ${mediaType}</li>
      <li style="margin-bottom: 8px;"><strong>Upload Fee:</strong> $${uploadCost.toFixed(2)}</li>
      <li style="margin-bottom: 8px;"><strong>Status:</strong> ✅ Published</li>
    </ul>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/media/${mediaId}" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Your Upload
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank (AiM) Team</strong>
  </p>
</body>
</html>
  `
}

/** Legacy rows or missing source — still notify once processing finishes */
export function generateGenericVideoLiveEmail(userName: string, mediaTitle: string, mediaId: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎬 Your video is ready</h1>
  </div>
  <p style="font-size: 16px;">Hi ${userName},</p>
  <p style="font-size: 16px;">Your video "<strong>${mediaTitle}</strong>" has finished processing and is now on the home feed.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/media/${mediaId}" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Open your upload
    </a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 14px; color: #666;">Sincerely,<br><strong>AI Media Tank (AiM) Team</strong></p>
</body>
</html>
  `
}
