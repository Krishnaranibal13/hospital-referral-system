-- AlterTable
ALTER TABLE `CreditTransaction` ADD COLUMN `redeemed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `redeemedAt` DATETIME(3) NULL,
    ADD COLUMN `redeemedByUserId` VARCHAR(191) NULL;
