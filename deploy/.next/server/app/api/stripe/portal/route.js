"use strict";(()=>{var e={};e.id=3744,e.ids=[3744],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},39491:e=>{e.exports=require("assert")},14300:e=>{e.exports=require("buffer")},32081:e=>{e.exports=require("child_process")},6113:e=>{e.exports=require("crypto")},9523:e=>{e.exports=require("dns")},82361:e=>{e.exports=require("events")},57147:e=>{e.exports=require("fs")},13685:e=>{e.exports=require("http")},95687:e=>{e.exports=require("https")},41808:e=>{e.exports=require("net")},22037:e=>{e.exports=require("os")},71017:e=>{e.exports=require("path")},63477:e=>{e.exports=require("querystring")},12781:e=>{e.exports=require("stream")},24404:e=>{e.exports=require("tls")},57310:e=>{e.exports=require("url")},73837:e=>{e.exports=require("util")},59796:e=>{e.exports=require("zlib")},26194:(e,r,t)=>{t.r(r),t.d(r,{originalPathname:()=>b,patchFetch:()=>w,requestAsyncStorage:()=>y,routeModule:()=>f,serverHooks:()=>h,staticGenerationAsyncStorage:()=>x});var o={};t.r(o),t.d(o,{POST:()=>g,dynamic:()=>m});var s=t(49303),a=t(88716),i=t(60670),n=t(87070),l=t(75571),p=t(95456),d=t(46029),c=t(20728),u=t(20471);let m="force-dynamic";async function g(e){try{let r;let t=await (0,l.getServerSession)(p.L);if(!t?.user)return n.NextResponse.json({error:"Please sign in"},{status:401});try{let t=await e.text();if(t){let e=JSON.parse(t);r=e.action,e.sendEmail}}catch{}let o=await c._.user.findUnique({where:{id:t.user.id},select:{stripeCustomerId:!0,stripeSubscriptionId:!0,membershipType:!0,email:!0,name:!0,username:!0}});if("cancel"===r){let e=o?.membershipType||"BASIC";if(await c._.user.update({where:{id:t.user.id},data:{membershipType:"VIEWER",stripeSubscriptionId:null}}),o?.email){let r=o.name||o.username||"Valued Customer";await (0,u.Cz)({to:o.email,subject:"Subscription Cancelled - AI Media Tank",html:`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">Subscription Cancelled</h1>
  </div>

  <p style="font-size: 16px;">Dear ${r},</p>

  <p style="font-size: 16px;">Your <strong>${e}</strong> subscription has been cancelled successfully.</p>

  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px;"><strong>What happens now:</strong></p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px;">
      <li>Your account has been downgraded to Viewer (Free)</li>
      <li>Your existing uploads will remain on the platform</li>
      <li>You can still browse and enjoy all public content</li>
      <li>You can resubscribe anytime to upload new content</li>
    </ul>
  </div>

  <p style="font-size: 16px;">We're sorry to see you go! If you have any feedback or questions, please don't hesitate to reach out.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Resubscribe Anytime
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`})}return n.NextResponse.json({success:!0,message:"Subscription cancelled. A confirmation email has been sent."})}if("downgrade"===r)return await c._.user.update({where:{id:t.user.id},data:{membershipType:"BASIC"}}),n.NextResponse.json({success:!0,message:"Downgraded to Basic successfully."});if("upgrade"===r)return await c._.user.update({where:{id:t.user.id},data:{membershipType:"PREMIUM"}}),n.NextResponse.json({success:!0,message:"Upgraded to Premium successfully."});if(o?.stripeCustomerId&&(0,d.x4)())try{let e=(0,d.d2)(),r=await e.billingPortal.sessions.create({customer:o.stripeCustomerId,return_url:`${process.env.NEXTAUTH_URL}/pricing`});return n.NextResponse.json({url:r.url})}catch(e){console.error("Stripe portal error:",e)}return n.NextResponse.json({showManualOptions:!0,currentPlan:o?.membershipType||"VIEWER"})}catch(e){return console.error("Error in portal:",e),n.NextResponse.json({error:"Failed to manage subscription",details:e.message},{status:500})}}let f=new s.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/stripe/portal/route",pathname:"/api/stripe/portal",filename:"route",bundlePath:"app/api/stripe/portal/route"},resolvedPagePath:"C:\\Users\\chong\\AI Studio\\aimediatank-azure\\src\\app\\api\\stripe\\portal\\route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:y,staticGenerationAsyncStorage:x,serverHooks:h}=f,b="/api/stripe/portal/route";function w(){return(0,i.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:x})}},95456:(e,r,t)=>{t.d(r,{L:()=>i});var o=t(53797),s=t(42023),a=t(20728);let i={session:{strategy:"jwt"},pages:{signIn:"/login"},providers:[(0,o.Z)({name:"credentials",credentials:{email:{label:"Email",type:"email"},password:{label:"Password",type:"password"}},async authorize(e){if(!e?.email||!e?.password)throw Error("Please enter email and password");let r=await a._.user.findUnique({where:{email:e.email}});if(!r)throw Error("No user found with this email");if(!await (0,s.compare)(e.password,r.password))throw Error("Invalid password");return{id:r.id,email:r.email,name:r.name,username:r.username,role:r.role,avatar:r.avatar}}})],callbacks:{jwt:async({token:e,user:r})=>(r&&(e.id=r.id,e.username=r.username,e.role=r.role,e.avatar=r.avatar),e),session:async({session:e,token:r})=>(e.user&&(e.user.id=r.id,e.user.username=r.username,e.user.role=r.role,e.user.avatar=r.avatar),e)}}},20471:(e,r,t)=>{t.d(r,{As:()=>n,Cz:()=>s,EO:()=>i,m5:()=>a});var o=t(55245);async function s(e){let r=process.env.EMAIL_FROM||process.env.SMTP_USER||"noreply@aimediatank.com",t=function(){let e=process.env.EMAIL_HOST||process.env.SMTP_HOST||"smtp.gmail.com",r=parseInt(process.env.EMAIL_PORT||process.env.SMTP_PORT||"587"),t=process.env.EMAIL_USER||process.env.SMTP_USER||"james.cho@aimediatank.com",s=process.env.EMAIL_PASS||process.env.SMTP_PASS||"ftjppnyzanybatwn";return console.log("SMTP Config: Using",e,"with user",t),o.createTransport({host:e,port:r,secure:465===r,auth:{user:t,pass:s}})}();if(!t)return console.log("SMTP not configured. Would send email to:",e.to),console.log("Subject:",e.subject),console.log("Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment variables"),!1;try{let o=await t.sendMail({from:r,to:e.to,subject:e.subject,html:e.html});return console.log("Email sent successfully to:",e.to),console.log("Message ID:",o.messageId),!0}catch(e){return console.error("Error sending email:",e),!1}}function a(e,r,t){let o=t.map(e=>`<li style="margin-bottom: 8px;">${e.title} - $${e.price.toFixed(2)}</li>`).join("");return`
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
  
  <p style="font-size: 16px;">You currently have <strong>${r} item${r>1?"s":""}</strong> that require${1===r?"s":""} your action to avoid losing access to your content.</p>
  
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
`}function i(e,r){return`
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
    <a href="${r}" style="display: inline-block; background-color: #00cc66; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; border: none;">
      Verify Email Address
    </a>
  </div>
  
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 12px; color: #0066cc; word-break: break-all;">${r}</p>
  
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
`}function n(e,r,t,o){let s=o.map(e=>`<li style="margin-bottom: 8px;">${e.title} - <span style="color: #ff6b6b; font-weight: bold;">${e.daysLeft} days left</span></li>`).join(""),a=t<=2?"#ff0000":t<=5?"#ff6b6b":"#ffa500";return`
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
      ⚠️ Your purchased items will be deleted in ${t} day${t>1?"s":""}!
    </p>
  </div>
  
  <p style="font-size: 16px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. Purchased items will be permanently deleted 10 days after the purchase date.</p>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Items Requiring Download:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${s}
  </ul>
  
  <p style="font-size: 16px;">You currently have <strong>${r} item${r>1?"s":""}</strong> that require${1===r?"s":""} your action to avoid losing access to your data.</p>
  
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
`}},20728:(e,r,t)=>{t.d(r,{_:()=>s});let o=require("@prisma/client"),s=globalThis.prisma??new o.PrismaClient},46029:(e,r,t)=>{t.d(r,{bZ:()=>l,d2:()=>i,x4:()=>n});var o=t(48472);let s=process.env.STRIPE_SECRET_KEY,a=null;function i(){if(!a){let e=process.env.STRIPE_SECRET_KEY;if(!e)throw Error("STRIPE_SECRET_KEY is not configured");a=new o.Z(e,{apiVersion:"2023-10-16",typescript:!0})}return a}function n(){return!!process.env.STRIPE_SECRET_KEY}function l(e){return Math.round(100*e)}s&&new o.Z(s,{apiVersion:"2023-10-16",typescript:!0})}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),o=r.X(0,[8948,5972,2023,1790,8472,5245],()=>t(26194));module.exports=o})();