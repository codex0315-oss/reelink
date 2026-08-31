/**
 * Deletes uploaded files that no listing or reel references any more.
 *
 * Listings and reels now clean up their own files, but rows removed by a database
 * cascade (deleting a user, for example) can't trigger that, so strays still collect
 * over time. Run this occasionally to reclaim the space.
 *
 *   node scripts/purge-orphaned-uploads.js            # dry run, lists what it would delete
 *   node scripts/purge-orphaned-uploads.js --delete   # actually deletes
 */
const fs = require('fs');
const path = require('path');
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const FOLDERS = ['listings', 'reels'];
const shouldDelete = process.argv.includes('--delete');

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const [listings, reels] = await Promise.all([
    prisma.listing.findMany({ select: { photoUrls: true } }),
    prisma.reel.findMany({ select: { videoUrl: true, photoUrls: true } }),
  ]);

  const referenced = new Set();
  for (const listing of listings) {
    listing.photoUrls.forEach((url) => referenced.add(path.basename(url)));
  }
  for (const reel of reels) {
    if (reel.videoUrl) referenced.add(path.basename(reel.videoUrl));
    reel.photoUrls.forEach((url) => referenced.add(path.basename(url)));
  }

  let count = 0;
  let bytes = 0;

  for (const folder of FOLDERS) {
    const dir = path.join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (referenced.has(file)) continue;

      const full = path.join(dir, file);
      bytes += fs.statSync(full).size;
      count++;
      console.log(`${shouldDelete ? 'deleted' : 'would delete'}  ${folder}/${file}`);
      if (shouldDelete) fs.unlinkSync(full);
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(
    count === 0
      ? '\nNo orphaned uploads found.'
      : `\n${shouldDelete ? 'Deleted' : 'Found'} ${count} orphaned file(s), ${mb} MB.` +
          (shouldDelete ? '' : '\nRe-run with --delete to remove them.'),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
