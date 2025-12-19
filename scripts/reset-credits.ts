import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function reset() {
  const user = await prisma.user.update({
    where: { email: 'chongcho@live.com' },
    data: { 
      paidUploadCredits: 0,
      freeUploadsUsed: 5 
    }
  })
  
  console.log('Reset complete:', {
    email: user.email,
    paidUploadCredits: user.paidUploadCredits,
    freeUploadsUsed: user.freeUploadsUsed
  })
  
  await prisma.$disconnect()
}

reset()



