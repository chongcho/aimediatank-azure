const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('Testing Prisma connection...');
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('Connected to database!');
    
    // Try to count users
    const count = await prisma.user.count();
    console.log('User count:', count);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();


