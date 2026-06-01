-- CreateTable
CREATE TABLE "ReadEvent" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "pageId" TEXT,
    "userId" TEXT,
    "client" TEXT NOT NULL DEFAULT 'unknown',
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadEvent_workId_createdAt_idx" ON "ReadEvent"("workId", "createdAt");

-- CreateIndex
CREATE INDEX "ReadEvent_workId_userId_idx" ON "ReadEvent"("workId", "userId");

-- CreateIndex
CREATE INDEX "ReadEvent_client_idx" ON "ReadEvent"("client");

-- CreateIndex
CREATE INDEX "ReadEvent_createdAt_idx" ON "ReadEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ReadEvent" ADD CONSTRAINT "ReadEvent_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadEvent" ADD CONSTRAINT "ReadEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
