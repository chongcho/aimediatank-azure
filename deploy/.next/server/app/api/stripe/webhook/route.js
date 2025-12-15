"use strict";(()=>{var e={};e.id=2757,e.ids=[2757],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},32081:e=>{e.exports=require("child_process")},6113:e=>{e.exports=require("crypto")},9523:e=>{e.exports=require("dns")},82361:e=>{e.exports=require("events")},57147:e=>{e.exports=require("fs")},13685:e=>{e.exports=require("http")},95687:e=>{e.exports=require("https")},41808:e=>{e.exports=require("net")},22037:e=>{e.exports=require("os")},71017:e=>{e.exports=require("path")},12781:e=>{e.exports=require("stream")},24404:e=>{e.exports=require("tls")},57310:e=>{e.exports=require("url")},73837:e=>{e.exports=require("util")},59796:e=>{e.exports=require("zlib")},51467:(e,t,o)=>{o.r(t),o.d(t,{originalPathname:()=>x,patchFetch:()=>b,requestAsyncStorage:()=>f,routeModule:()=>h,serverHooks:()=>y,staticGenerationAsyncStorage:()=>g});var r={};o.r(r),o.d(r,{POST:()=>m,dynamic:()=>c});var a=o(49303),i=o(88716),s=o(60670),n=o(87070),l=o(20728),p=o(48472),d=o(20471);let c="force-dynamic",u=new p.Z(process.env.STRIPE_SECRET_KEY,{apiVersion:"2023-10-16"});async function m(e){let t;let o=await e.text(),r=e.headers.get("stripe-signature");try{t=u.webhooks.constructEvent(o,r,process.env.STRIPE_WEBHOOK_SECRET)}catch(e){return console.error("Webhook signature verification failed:",e.message),n.NextResponse.json({error:"Invalid signature"},{status:400})}switch(t.type){case"checkout.session.completed":{let e=t.data.object,o=await l._.purchase.findMany({where:{stripeSessionId:e.id},include:{media:{select:{id:!0,title:!0,price:!0}},buyer:{select:{id:!0,email:!0,name:!0,username:!0}}}});await l._.purchase.updateMany({where:{stripeSessionId:e.id},data:{status:"completed",stripePaymentId:e.payment_intent,completedAt:new Date}});let r=new Date,a=new Date(r.getTime()+864e6);for(let e of o)await l._.media.update({where:{id:e.mediaId},data:{isSold:!0,soldAt:r,deleteAfter:a}});if(console.log(`Marked ${o.length} media items as SOLD, scheduled for deletion on ${a.toISOString()}`),o.length>0){let e=o[0].buyer,t=e.email,r=e.name||e.username||"Valued Customer",a=o.map(e=>({title:e.media.title,price:e.media.price||0})),i=(0,d.m5)(r,o.length,a);await (0,d.Cz)({to:t,subject:`🎉 Purchase Confirmed - Download Your ${o.length} Item${o.length>1?"s":""} | AI Media Tank`,html:i}),console.log(`Sent purchase confirmation email to ${t}`);let s=a.map(e=>e.title).join(", ");await l._.notification.create({data:{userId:e.id,type:"purchase",title:"Purchase Confirmed! \uD83C\uDF89",message:`Your purchase of "${s}" is complete. Download within 10 days before it expires.`,link:`/profile/${e.username}`}})}break}case"checkout.session.expired":{let e=t.data.object;await l._.purchase.updateMany({where:{stripeSessionId:e.id},data:{status:"failed"}});break}default:console.log(`Unhandled event type: ${t.type}`)}return n.NextResponse.json({received:!0})}let h=new a.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/stripe/webhook/route",pathname:"/api/stripe/webhook",filename:"route",bundlePath:"app/api/stripe/webhook/route"},resolvedPagePath:"C:\\Users\\chong\\AI Studio\\aimediatank-azure\\src\\app\\api\\stripe\\webhook\\route.ts",nextConfigOutput:"standalone",userland:r}),{requestAsyncStorage:f,staticGenerationAsyncStorage:g,serverHooks:y}=h,x="/api/stripe/webhook/route";function b(){return(0,s.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:g})}},20471:(e,t,o)=>{o.d(t,{As:()=>n,Cz:()=>a,EO:()=>s,m5:()=>i});var r=o(55245);async function a(e){let t=process.env.EMAIL_FROM||process.env.SMTP_USER||"noreply@aimediatank.com",o=function(){let e=process.env.EMAIL_HOST||process.env.SMTP_HOST||"smtp.gmail.com",t=parseInt(process.env.EMAIL_PORT||process.env.SMTP_PORT||"587"),o=process.env.EMAIL_USER||process.env.SMTP_USER||"james.cho@aimediatank.com",a=process.env.EMAIL_PASS||process.env.SMTP_PASS||"ftjppnyzanybatwn";return console.log("SMTP Config: Using",e,"with user",o),r.createTransport({host:e,port:t,secure:465===t,auth:{user:o,pass:a}})}();if(!o)return console.log("SMTP not configured. Would send email to:",e.to),console.log("Subject:",e.subject),console.log("Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment variables"),!1;try{let r=await o.sendMail({from:t,to:e.to,subject:e.subject,html:e.html});return console.log("Email sent successfully to:",e.to),console.log("Message ID:",r.messageId),!0}catch(e){return console.error("Error sending email:",e),!1}}function i(e,t,o){let r=o.map(e=>`<li style="margin-bottom: 8px;">${e.title} - $${e.price.toFixed(2)}</li>`).join("");return`
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
  
  <p style="font-size: 16px;">Dear ${e},</p>
  
  <p style="font-size: 16px;">Thank you for your purchase! Your items are now available for download.</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff6b6b;">
    <p style="margin: 0 0 10px 0; font-weight: bold; color: #ff6b6b;">⚠️ Important: Download Required</p>
    <p style="margin: 0; font-size: 14px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. <strong>Purchased items will be permanently deleted 10 days after the purchase date.</strong></p>
  </div>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Your Purchased Items:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${r}
  </ul>
  
  <p style="font-size: 16px;">You currently have <strong>${t} item${t>1?"s":""}</strong> that require${1===t?"s":""} your action to avoid losing access to your content.</p>
  
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
`}function s(e,t){return`
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
  
  <p style="font-size: 16px;">Hello ${e},</p>
  
  <p style="font-size: 16px;">Thank you for registering with AI Media Tank! Please verify your email address by clicking the button below:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${t}" style="display: inline-block; background-color: #00cc66; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none;">
      Verify Email Address
    </a>
  </div>
  
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 12px; color: #0066cc; word-break: break-all;">${t}</p>
  
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
`}function n(e,t,o,r){let a=r.map(e=>`<li style="margin-bottom: 8px;">${e.title} - <span style="color: #ff6b6b; font-weight: bold;">${e.daysLeft} days left</span></li>`).join(""),i=o<=2?"#ff0000":o<=5?"#ff6b6b":"#ffa500";return`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: ${i}; margin: 0; font-size: 24px;">⏰ Download Reminder</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${e},</p>
  
  <div style="background: #fff3f3; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid ${i};">
    <p style="margin: 0; font-size: 16px; color: ${i}; font-weight: bold;">
      ⚠️ Your purchased items will be deleted in ${o} day${o>1?"s":""}!
    </p>
  </div>
  
  <p style="font-size: 16px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. Purchased items will be permanently deleted 10 days after the purchase date.</p>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Items Requiring Download:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${a}
  </ul>
  
  <p style="font-size: 16px;">You currently have <strong>${t} item${t>1?"s":""}</strong> that require${1===t?"s":""} your action to avoid losing access to your data.</p>
  
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
`}},20728:(e,t,o)=>{o.d(t,{_:()=>a});let r=require("@prisma/client"),a=globalThis.prisma??new r.PrismaClient}};var t=require("../../../../webpack-runtime.js");t.C(e);var o=e=>t(t.s=e),r=t.X(0,[8948,5972,8472,5245],()=>o(51467));module.exports=r})();