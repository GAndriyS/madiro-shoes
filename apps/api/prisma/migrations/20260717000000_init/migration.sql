-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SELLER');

-- CreateEnum
CREATE TYPE "Material" AS ENUM ('LEATHER', 'SUEDE');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('NONE', 'BAIKA', 'SHEEPSKIN');

-- CreateEnum
CREATE TYPE "PairStatus" AS ENUM ('IN_STOCK', 'SOLD', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('INTAKE', 'SALE', 'RETURN', 'WRITEOFF');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SELLER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "material" "Material",
    "season" "Season",
    "purchasePrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairs" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "PairStatus" NOT NULL DEFAULT 'IN_STOCK',
    "awaitingPrice" BOOLEAN NOT NULL DEFAULT false,
    "intakeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "pairId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchasePriceAtTime" DECIMAL(10,2),
    "salePrice" DECIMAL(10,2),
    "paymentMethod" "PaymentMethod",
    "comment" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE INDEX "variants_style_idx" ON "variants"("style");

-- CreateIndex
CREATE UNIQUE INDEX "variants_style_color_material_season_key" ON "variants"("style", "color", "material", "season");

-- CreateIndex
CREATE INDEX "pairs_variantId_size_status_idx" ON "pairs"("variantId", "size", "status");

-- CreateIndex
CREATE INDEX "pairs_status_awaitingPrice_idx" ON "pairs"("status", "awaitingPrice");

-- CreateIndex
CREATE INDEX "operations_pairId_idx" ON "operations"("pairId");

-- CreateIndex
CREATE INDEX "operations_type_createdAt_idx" ON "operations"("type", "createdAt");

-- CreateIndex
CREATE INDEX "operations_userId_createdAt_idx" ON "operations"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

