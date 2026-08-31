/**
 * Removes the throwaway accounts created while testing, and everything they own.
 *
 * Scoped strictly to the .local test domains the harness used — real accounts
 * (gmail.com, reelink.com) are never matched. Deleting the user cascades to their
 * listings, reels and renders, so this is the whole cleanup in one step.
 *
 * Run with --apply to actually delete; without it, it only reports.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { unlink } = require('fs/promises');
const path = require('path');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

const TEST_DOMAINS = ['@t.local', '@test.local'];
const apply = process.argv.includes('--apply');

(async () => {
  const users = await p.user.findMany({
    where: { OR: TEST_DOMAINS.map((d) => ({ email: { endsWith: d } })) },
    include: {
      listings: { select: { title: true } },
      reels: { select: { videoUrl: true } },
    },
  });

  if (users.length === 0) {
    console.log('No test accounts found — nothing to clean up.');
    await p.$disconnect();
    return;
  }

  console.log((apply ? 'DELETING' : 'WOULD DELETE') + ' ' + users.length + ' test account(s):\n');
  const videos = [];
  for (const u of users) {
    console.log('  ' + u.email);
    for (const l of u.listings) console.log('      listing: ' + l.title);
    for (const r of u.reels) {
      if (r.videoUrl) {
        console.log('      reel:    ' + r.videoUrl);
        videos.push(r.videoUrl);
      }
    }
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete.');
    await p.$disconnect();
    return;
  }

  // Rendered files live on disk, so the rows going away is only half the cleanup.
  for (const v of videos) {
    await unlink(path.join(process.cwd(), 'uploads', 'reels', path.basename(v))).catch(
      () => undefined,
    );
  }

  const { count } = await p.user.deleteMany({
    where: { OR: TEST_DOMAINS.map((d) => ({ email: { endsWith: d } })) },
  });

  console.log('\nDeleted ' + count + ' account(s) and ' + videos.length + ' video file(s).');
  await p.$disconnect();
})();
