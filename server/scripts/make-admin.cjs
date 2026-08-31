/**
 * Promotes an existing account to admin.
 *
 *   node scripts/make-admin.cjs you@example.com
 *
 * Deliberately a script and not an API route. There is no endpoint anywhere that can
 * set `role`, which means there is no request an attacker can craft to escalate — the
 * only way in is shell access to the server, and anyone with that already owns it.
 *
 * Run again with --demote to take the role away.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  const email = process.argv[2];
  const demote = process.argv.includes('--demote');

  if (!email) {
    console.error('Usage: node scripts/make-admin.cjs <email> [--demote]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    console.error(`No account found for ${email}. Sign up first, then run this.`);
    process.exit(1);
  }

  const role = demote ? 'agent' : 'admin';
  if (user.role === role) {
    console.log(`${user.email} is already ${role}. Nothing to do.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(`${user.name} <${user.email}> is now ${role}.`);
  if (!demote) console.log('Sign out and back in, then open /admin.');
})()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
