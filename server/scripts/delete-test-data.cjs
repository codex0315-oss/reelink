/**
 * Removes the test accounts and their listings, reels and messages.
 *
 *   node scripts/delete-test-data.cjs            # shows what would go, deletes nothing
 *   node scripts/delete-test-data.cjs --yes      # actually deletes it
 *
 * A script rather than an admin route, for the same reason as make-admin.cjs: nothing
 * reachable over HTTP should be able to delete another account's listings, so the only
 * way to run this is to already have the credentials.
 *
 * Dry run by default. This deletes across accounts and cannot be undone, so the safe
 * thing has to be the thing that happens when you get the command slightly wrong.
 *
 * Test accounts are identified by the @t.local domain, which was only ever used for
 * seeded accounts — no real agent can register with it, since it is not a deliverable
 * mail domain and registration requires a verifiable address.
 *
 * Files are not touched. The uploads these rows point at were written to Render's
 * container filesystem before object storage existed and were destroyed with the
 * container; there is nothing left to clean up.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const TEST_EMAIL_DOMAIN = '@t.local';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  const confirmed = process.argv.includes('--yes');

  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      _count: { select: { listings: true, reels: true } },
    },
  });

  if (users.length === 0) {
    console.log(`No accounts found ending in ${TEST_EMAIL_DOMAIN}. Nothing to do.`);
    return;
  }

  // Refuse to touch an admin. Deleting the account you administer the site with is a
  // mistake no confirmation flag should be able to talk you into.
  const admins = users.filter((u) => u.role === 'admin');
  if (admins.length > 0) {
    console.error(
      `Refusing to run: ${admins.map((u) => u.email).join(', ')} ` +
        `${admins.length === 1 ? 'is an admin' : 'are admins'}. Demote first if this is really intended.`,
    );
    process.exit(1);
  }

  const listings = await prisma.listing.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { id: true, title: true, price: true },
  });

  console.log(`Accounts (${users.length}):`);
  for (const u of users) {
    console.log(
      `  ${u.name} <${u.email}> — ${u._count.listings} listing(s), ${u._count.reels} reel(s)`,
    );
  }
  console.log(`\nListings (${listings.length}):`);
  for (const l of listings) {
    console.log(`  "${l.title}" — ₱${l.price.toLocaleString()}`);
  }

  if (!confirmed) {
    console.log('\nDry run — nothing deleted. Re-run with --yes to go ahead.');
    return;
  }

  // Deleting the users is enough: listings, reels, messages, notifications and views
  // all cascade from the owner in the schema. Doing it in one call keeps it atomic —
  // a failure halfway through would otherwise leave a half-deleted account behind.
  const { count } = await prisma.user.deleteMany({
    where: { id: { in: users.map((u) => u.id) } },
  });

  console.log(`\nDeleted ${count} account(s) and everything belonging to them.`);
})()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
