-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "attributedToId" TEXT;

-- CreateIndex
CREATE INDEX "operations_attributedToId_createdAt_idx" ON "operations"("attributedToId", "createdAt");

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_attributedToId_fkey" FOREIGN KEY ("attributedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing returns: attribute each one to the seller whose sale it reversed —
-- the latest non-cancelled SALE of the same pair before the return. Reads that
-- fall back to `userId` when attribution is null would otherwise keep charging
-- the person at the counter, which is the behaviour this column replaces.
UPDATE "operations" AS r
SET "attributedToId" = (
  SELECT o."userId"
  FROM "operations" o
  WHERE o."pairId" = r."pairId"
    AND o."type" = 'SALE'
    AND o."cancelledAt" IS NULL
    AND o."createdAt" <= r."createdAt"
  ORDER BY o."createdAt" DESC
  LIMIT 1
)
WHERE r."type" = 'RETURN' AND r."attributedToId" IS NULL;
