-- CreateTable
CREATE TABLE "ReelRender" (
    "id" TEXT NOT NULL,
    "reelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ReelRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelRender_userId_createdAt_idx" ON "ReelRender"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReelRender" ADD CONSTRAINT "ReelRender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
