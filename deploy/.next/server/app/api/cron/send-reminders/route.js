"use strict";(()=>{var e={};e.id=7951,e.ids=[7951],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},32081:e=>{e.exports=require("child_process")},6113:e=>{e.exports=require("crypto")},9523:e=>{e.exports=require("dns")},82361:e=>{e.exports=require("events")},57147:e=>{e.exports=require("fs")},13685:e=>{e.exports=require("http")},95687:e=>{e.exports=require("https")},41808:e=>{e.exports=require("net")},22037:e=>{e.exports=require("os")},71017:e=>{e.exports=require("path")},12781:e=>{e.exports=require("stream")},24404:e=>{e.exports=require("tls")},57310:e=>{e.exports=require("url")},73837:e=>{e.exports=require("util")},59796:e=>{e.exports=require("zlib")},90130:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>y,patchFetch:()=>x,requestAsyncStorage:()=>f,routeModule:()=>m,serverHooks:()=>h,staticGenerationAsyncStorage:()=>g});var o={};r.r(o),r.d(o,{GET:()=>c,POST:()=>u,dynamic:()=>p});var n=r(49303),a=r(88716),i=r(60670),s=r(87070),l=r(20728),d=r(20471);let p="force-dynamic";async function c(e){e.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`&&console.log("Warning: Cron job called without proper authorization");let t=new Date,r=[];try{let e=await l._.purchase.findMany({where:{status:"completed",media:{isSold:!0,deleteAfter:{gt:t}}},include:{buyer:{select:{id:!0,email:!0,name:!0,username:!0}},media:{select:{id:!0,title:!0,deleteAfter:!0}}}}),o={};for(let t of e){let e=t.buyer.id;o[e]||(o[e]=[]),o[e].push(t)}for(let e of Object.keys(o)){let n=o[e],a=n[0].buyer,i=n.map(e=>{let r=new Date(e.media.deleteAfter).getTime()-t.getTime(),o=Math.ceil(r/864e5);return{title:e.media.title,daysLeft:o,mediaId:e.media.id}}),s=Math.min(...i.map(e=>e.daysLeft));if([7,3,1].includes(s)){let t=a.name||a.username||"Valued Customer",o=a.email,n=i.filter(e=>e.daysLeft<=7);if(n.length>0){let i=(0,d.As)(t,n.length,s,n),p=await (0,d.Cz)({to:o,subject:`⏰ ${s} Day${s>1?"s":""} Left - Download Your Purchases Before Deletion | AI Media Tank`,html:i}),c=n.map(e=>e.title).slice(0,3).join(", "),u=n.length>3?` and ${n.length-3} more`:"";await l._.notification.create({data:{userId:e,type:"download_reminder",title:`⏰ ${s} Day${s>1?"s":""} Left!`,message:`Download "${c}"${u} before they are permanently deleted.`,link:`/profile/${a.username}`}}),r.push({buyerId:e,buyerEmail:o,itemCount:n.length,minDaysRemaining:s,emailSent:p})}}}let n=Object.keys(o).length;return console.log(`Reminder cron completed. Processed ${n} buyers, sent ${r.filter(e=>e.emailSent).length} emails`),s.NextResponse.json({success:!0,timestamp:t.toISOString(),totalBuyers:n,remindersSent:r.length,results:r})}catch(e){return console.error("Error in reminder cron:",e),s.NextResponse.json({error:"Failed to process reminders",details:e.message,results:r},{status:500})}}async function u(e){return c(e)}let m=new n.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/cron/send-reminders/route",pathname:"/api/cron/send-reminders",filename:"route",bundlePath:"app/api/cron/send-reminders/route"},resolvedPagePath:"C:\\Users\\chong\\AI Studio\\aimediatank-azure\\src\\app\\api\\cron\\send-reminders\\route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:f,staticGenerationAsyncStorage:g,serverHooks:h}=m,y="/api/cron/send-reminders/route";function x(){return(0,i.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:g})}},20471:(e,t,r)=>{r.d(t,{As:()=>s,Cz:()=>n,EO:()=>i,m5:()=>a});var o=r(55245);async function n(e){let t=process.env.EMAIL_FROM||process.env.SMTP_USER||"noreply@aimediatank.com",r=function(){let e=process.env.EMAIL_HOST||process.env.SMTP_HOST||"smtp.gmail.com",t=parseInt(process.env.EMAIL_PORT||process.env.SMTP_PORT||"587"),r=process.env.EMAIL_USER||process.env.SMTP_USER||"james.cho@aimediatank.com",n=process.env.EMAIL_PASS||process.env.SMTP_PASS||"ftjppnyzanybatwn";return console.log("SMTP Config: Using",e,"with user",r),o.createTransport({host:e,port:t,secure:465===t,auth:{user:r,pass:n}})}();if(!r)return console.log("SMTP not configured. Would send email to:",e.to),console.log("Subject:",e.subject),console.log("Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment variables"),!1;try{let o=await r.sendMail({from:t,to:e.to,subject:e.subject,html:e.html});return console.log("Email sent successfully to:",e.to),console.log("Message ID:",o.messageId),!0}catch(e){return console.error("Error sending email:",e),!1}}function a(e,t,r){let o=r.map(e=>`<li style="margin-bottom: 8px;">${e.title} - $${e.price.toFixed(2)}</li>`).join("");return`
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
    ${o}
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
`}function i(e,t){return`
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
`}function s(e,t,r,o){let n=o.map(e=>`<li style="margin-bottom: 8px;">${e.title} - <span style="color: #ff6b6b; font-weight: bold;">${e.daysLeft} days left</span></li>`).join(""),a=r<=2?"#ff0000":r<=5?"#ff6b6b":"#ffa500";return`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: ${a}; margin: 0; font-size: 24px;">⏰ Download Reminder</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${e},</p>
  
  <div style="background: #fff3f3; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid ${a};">
    <p style="margin: 0; font-size: 16px; color: ${a}; font-weight: bold;">
      ⚠️ Your purchased items will be deleted in ${r} day${r>1?"s":""}!
    </p>
  </div>
  
  <p style="font-size: 16px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. Purchased items will be permanently deleted 10 days after the purchase date.</p>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Items Requiring Download:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${n}
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
`}},20728:(e,t,r)=>{r.d(t,{_:()=>n});let o=require("@prisma/client"),n=globalThis.prisma??new o.PrismaClient}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),o=t.X(0,[8948,5972,5245],()=>r(90130));module.exports=o})();