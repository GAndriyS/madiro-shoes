-- CreateTable
CREATE TABLE "exchange_rates" (
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("currency")
);
