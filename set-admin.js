require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setAdmin() {
  try {
    const user = await prisma.user.update({
      where: { email: 'support@aimediatank.com' },
      data: { role: 'ADMIN' }
    });
    console.log('✅ Updated user:', user.username, 'to ADMIN role');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

setAdmin();

