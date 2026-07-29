-- AlterTable
ALTER TABLE `CreditTransaction` ADD COLUMN `paymentMethod` VARCHAR(191) NULL,
    ADD COLUMN `referenceNumber` VARCHAR(191) NULL,
    ADD COLUMN `remarks` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Doctor` ADD COLUMN `specialty` VARCHAR(191) NULL;
