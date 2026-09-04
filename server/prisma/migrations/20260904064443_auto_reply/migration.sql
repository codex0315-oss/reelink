-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isAutomated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true;
