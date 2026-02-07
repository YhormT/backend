const { PrismaClient } = require('@prisma/client');

let prisma;

if (global.prisma) {
  prisma = global.prisma;
} else {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  global.prisma = prisma;
}

// Graceful shutdown for Railway
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing Prisma connection...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing Prisma connection...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = prisma;
