"use strict";(()=>{var e={};e.id=127,e.ids=[127],e.modules={72934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},54580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},45869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},39491:e=>{e.exports=require("assert")},14300:e=>{e.exports=require("buffer")},32081:e=>{e.exports=require("child_process")},6113:e=>{e.exports=require("crypto")},9523:e=>{e.exports=require("dns")},82361:e=>{e.exports=require("events")},57147:e=>{e.exports=require("fs")},13685:e=>{e.exports=require("http")},95687:e=>{e.exports=require("https")},41808:e=>{e.exports=require("net")},22037:e=>{e.exports=require("os")},71017:e=>{e.exports=require("path")},63477:e=>{e.exports=require("querystring")},12781:e=>{e.exports=require("stream")},24404:e=>{e.exports=require("tls")},57310:e=>{e.exports=require("url")},73837:e=>{e.exports=require("util")},59796:e=>{e.exports=require("zlib")},41545:(e,r,t)=>{t.r(r),t.d(r,{originalPathname:()=>h,patchFetch:()=>b,requestAsyncStorage:()=>g,routeModule:()=>f,serverHooks:()=>y,staticGenerationAsyncStorage:()=>x});var o={};t.r(o),t.d(o,{POST:()=>m});var a=t(49303),s=t(88716),n=t(60670),i=t(87070),l=t(75571),p=t(95456),d=t(20728),c=t(9576),u=t(20471);async function m(e){try{let r=await (0,l.getServerSession)(p.L),t=null;if(!(t=r?.user?.email?r.user.email:(await e.json()).email))return i.NextResponse.json({error:"Email is required"},{status:400});let o=await d._.user.findUnique({where:{email:t}});if(!o)return i.NextResponse.json({error:"User not found"},{status:404});if(o.emailVerified)return i.NextResponse.json({error:"Email is already verified"},{status:400});let a=(0,c.Z)().replace(/-/g,"")+(0,c.Z)().replace(/-/g,""),s=new Date(Date.now()+864e5);await d._.user.update({where:{id:o.id},data:{verificationToken:a,verificationExpires:s}});let n=process.env.NEXTAUTH_URL||"https://www.aimediatank.com",m=`${n}/verify-email?token=${a}`,f=o.name||o.username||"User",g=(0,u.EO)(f,m),x=await (0,u.Cz)({to:o.email,subject:"Verify your AI Media Tank account",html:g});if(console.log("=".repeat(60)),console.log("VERIFICATION EMAIL"),console.log("=".repeat(60)),console.log(`To: ${o.email}`),console.log(`Email sent: ${x}`),console.log(`Verification URL: ${m}`),console.log(`SMTP_HOST configured: ${!!process.env.SMTP_HOST}`),console.log(`SMTP_USER configured: ${!!process.env.SMTP_USER}`),console.log(`SMTP_PASS configured: ${!!process.env.SMTP_PASS}`),console.log("=".repeat(60)),!x)return i.NextResponse.json({error:"Email service not configured. Please contact support or try again later.",success:!1,smtpConfigured:!!process.env.SMTP_HOST},{status:503});return i.NextResponse.json({message:"Verification email sent! Please check your inbox.",success:!0})}catch(e){return console.error("Error sending verification email:",e),i.NextResponse.json({error:"Failed to send verification email"},{status:500})}}let f=new a.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/auth/send-verification/route",pathname:"/api/auth/send-verification",filename:"route",bundlePath:"app/api/auth/send-verification/route"},resolvedPagePath:"C:\\Users\\chong\\AI Studio\\aimediatank-azure\\src\\app\\api\\auth\\send-verification\\route.ts",nextConfigOutput:"standalone",userland:o}),{requestAsyncStorage:g,staticGenerationAsyncStorage:x,serverHooks:y}=f,h="/api/auth/send-verification/route";function b(){return(0,n.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:x})}},9576:(e,r,t)=>{t.d(r,{Z:()=>p});var o=t(6113),a=t.n(o);let s={randomUUID:a().randomUUID},n=new Uint8Array(256),i=n.length,l=[];for(let e=0;e<256;++e)l.push((e+256).toString(16).slice(1));let p=function(e,r,t){if(s.randomUUID&&!r&&!e)return s.randomUUID();let o=(e=e||{}).random||(e.rng||function(){return i>n.length-16&&(a().randomFillSync(n),i=0),n.slice(i,i+=16)})();if(o[6]=15&o[6]|64,o[8]=63&o[8]|128,r){t=t||0;for(let e=0;e<16;++e)r[t+e]=o[e];return r}return function(e,r=0){return l[e[r+0]]+l[e[r+1]]+l[e[r+2]]+l[e[r+3]]+"-"+l[e[r+4]]+l[e[r+5]]+"-"+l[e[r+6]]+l[e[r+7]]+"-"+l[e[r+8]]+l[e[r+9]]+"-"+l[e[r+10]]+l[e[r+11]]+l[e[r+12]]+l[e[r+13]]+l[e[r+14]]+l[e[r+15]]}(o)}},95456:(e,r,t)=>{t.d(r,{L:()=>n});var o=t(53797),a=t(42023),s=t(20728);let n={session:{strategy:"jwt"},pages:{signIn:"/login"},providers:[(0,o.Z)({name:"credentials",credentials:{email:{label:"Email",type:"email"},password:{label:"Password",type:"password"}},async authorize(e){if(!e?.email||!e?.password)throw Error("Please enter email and password");let r=await s._.user.findUnique({where:{email:e.email}});if(!r)throw Error("No user found with this email");if(!await (0,a.compare)(e.password,r.password))throw Error("Invalid password");return{id:r.id,email:r.email,name:r.name,username:r.username,role:r.role,avatar:r.avatar}}})],callbacks:{jwt:async({token:e,user:r})=>(r&&(e.id=r.id,e.username=r.username,e.role=r.role,e.avatar=r.avatar),e),session:async({session:e,token:r})=>(e.user&&(e.user.id=r.id,e.user.username=r.username,e.user.role=r.role,e.user.avatar=r.avatar),e)}}},20471:(e,r,t)=>{t.d(r,{As:()=>i,Cz:()=>a,EO:()=>n,m5:()=>s});var o=t(55245);async function a(e){let r=process.env.EMAIL_FROM||process.env.SMTP_USER||"noreply@aimediatank.com",t=function(){let e=process.env.EMAIL_HOST||process.env.SMTP_HOST||"smtp.gmail.com",r=parseInt(process.env.EMAIL_PORT||process.env.SMTP_PORT||"587"),t=process.env.EMAIL_USER||process.env.SMTP_USER||"james.cho@aimediatank.com",a=process.env.EMAIL_PASS||process.env.SMTP_PASS||"ftjppnyzanybatwn";return console.log("SMTP Config: Using",e,"with user",t),o.createTransport({host:e,port:r,secure:465===r,auth:{user:t,pass:a}})}();if(!t)return console.log("SMTP not configured. Would send email to:",e.to),console.log("Subject:",e.subject),console.log("Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment variables"),!1;try{let o=await t.sendMail({from:r,to:e.to,subject:e.subject,html:e.html});return console.log("Email sent successfully to:",e.to),console.log("Message ID:",o.messageId),!0}catch(e){return console.error("Error sending email:",e),!1}}function s(e,r,t){let o=t.map(e=>`<li style="margin-bottom: 8px;">${e.title} - $${e.price.toFixed(2)}</li>`).join("");return`
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
`}function n(e,r){return`
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
`}function i(e,r,t,o){let a=o.map(e=>`<li style="margin-bottom: 8px;">${e.title} - <span style="color: #ff6b6b; font-weight: bold;">${e.daysLeft} days left</span></li>`).join(""),s=t<=2?"#ff0000":t<=5?"#ff6b6b":"#ffa500";return`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: ${s}; margin: 0; font-size: 24px;">⏰ Download Reminder</h1>
  </div>
  
  <p style="font-size: 16px;">Dear ${e},</p>
  
  <div style="background: #fff3f3; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid ${s};">
    <p style="margin: 0; font-size: 16px; color: ${s}; font-weight: bold;">
      ⚠️ Your purchased items will be deleted in ${t} day${t>1?"s":""}!
    </p>
  </div>
  
  <p style="font-size: 16px;">Please download your purchased items from <strong>My Contents → Purchased</strong> before they are removed from the server. Purchased items will be permanently deleted 10 days after the purchase date.</p>
  
  <h3 style="color: #1a1a2e; margin-top: 30px;">Items Requiring Download:</h3>
  <ul style="background: #f8f9fa; padding: 20px 20px 20px 40px; border-radius: 8px;">
    ${a}
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
`}},20728:(e,r,t)=>{t.d(r,{_:()=>a});let o=require("@prisma/client"),a=globalThis.prisma??new o.PrismaClient}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),o=r.X(0,[8948,5972,2023,1790,5245],()=>t(41545));module.exports=o})();