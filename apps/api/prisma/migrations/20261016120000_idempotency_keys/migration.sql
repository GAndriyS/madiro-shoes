-- Expand-only: a new table nothing in the previous release reads, so rolling
-- back to it leaves the table idle rather than in the way.

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("userId","key")
);

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
