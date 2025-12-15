"use strict";(()=>{var e={};e.id=4595,e.ids=[4595],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},2622:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>m,patchFetch:()=>f,requestAsyncStorage:()=>E,routeModule:()=>l,serverHooks:()=>N,staticGenerationAsyncStorage:()=>T});var i={};a.r(i),a.d(i,{GET:()=>p,POST:()=>d,dynamic:()=>u});var s=a(49303),r=a(88716),n=a(60670),o=a(87070),c=a(20728);let u="force-dynamic";async function d(e){let t=[];try{try{await c._.$executeRaw`
        CREATE TABLE IF NOT EXISTS "Notification" (
          "id" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "link" TEXT,
          "read" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "userId" TEXT NOT NULL,
          CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `,t.push({step:"create_notification_table",status:"success"})}catch(e){t.push({step:"create_notification_table",status:"skipped_or_exists",message:e.message})}try{await c._.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId")`,await c._.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read")`,await c._.$executeRaw`CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt")`,t.push({step:"create_indexes",status:"success"})}catch(e){t.push({step:"create_indexes",status:"skipped_or_error",message:e.message})}let e=await c._.purchase.findMany({where:{status:"completed"},include:{buyer:{select:{id:!0,email:!0,name:!0,username:!0}},media:{select:{id:!0,title:!0,price:!0}}},orderBy:{completedAt:"desc"}});t.push({step:"find_purchases",count:e.length});let a=0;for(let i of e)try{let e=await c._.$queryRaw`
          SELECT id FROM "Notification" 
          WHERE "userId" = ${i.buyer.id} 
          AND "type" = 'purchase'
          AND "message" LIKE ${`%${i.media.title}%`}
          LIMIT 1
        `;if(0===e.length){let e=crypto.randomUUID();await c._.$executeRaw`
            INSERT INTO "Notification" ("id", "type", "title", "message", "link", "read", "createdAt", "userId")
            VALUES (
              ${e},
              'purchase',
              'Purchase Confirmed! 🎉',
              ${'Your purchase of "'+i.media.title+'" is complete. Download within 10 days before it expires.'},
              ${"/profile/"+i.buyer.username},
              false,
              ${i.completedAt||new Date},
              ${i.buyer.id}
            )
          `,a++}}catch(e){t.push({step:"create_notification",purchaseId:i.id,status:"error",message:e.message})}return t.push({step:"create_notifications",created:a}),o.NextResponse.json({success:!0,results:t})}catch(e){return console.error("Error syncing notifications:",e),o.NextResponse.json({error:"Failed to sync notifications",details:e.message,results:t},{status:500})}}async function p(e){try{let e=!1;try{let t=await c._.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'Notification'
        )
      `;e=t[0]?.exists||!1}catch(t){e=!1}let t=0,a=0;if(e){let e=await c._.$queryRaw`SELECT COUNT(*) as count FROM "Notification"`;t=parseInt(e[0]?.count||"0")}return a=await c._.purchase.count({where:{status:"completed"}}),o.NextResponse.json({tableExists:e,notificationCount:t,completedPurchases:a,needsSync:a>t})}catch(e){return o.NextResponse.json({error:"Failed to check status",details:e.message},{status:500})}}let l=new s.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/admin/sync-notifications/route",pathname:"/api/admin/sync-notifications",filename:"route",bundlePath:"app/api/admin/sync-notifications/route"},resolvedPagePath:"C:\\Users\\chong\\AI Studio\\aimediatank-azure\\src\\app\\api\\admin\\sync-notifications\\route.ts",nextConfigOutput:"standalone",userland:i}),{requestAsyncStorage:E,staticGenerationAsyncStorage:T,serverHooks:N}=l,m="/api/admin/sync-notifications/route";function f(){return(0,n.patchFetch)({serverHooks:N,staticGenerationAsyncStorage:T})}},20728:(e,t,a)=>{a.d(t,{_:()=>s});let i=require("@prisma/client"),s=globalThis.prisma??new i.PrismaClient}};var t=require("../../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),i=t.X(0,[8948,5972],()=>a(2622));module.exports=i})();