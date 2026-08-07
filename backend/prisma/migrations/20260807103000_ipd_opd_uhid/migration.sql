-- CreateEnum
-- MySQL represents Prisma enums as inline ENUM types on the column itself, so this is
-- applied directly on the Referral table below rather than as a separate CREATE TYPE.

-- AlterTable
ALTER TABLE `Hospital` ADD COLUMN `ipdAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `opdAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Referral` ADD COLUMN `uhid` VARCHAR(191) NULL,
    ADD COLUMN `visitType` ENUM('IPD', 'OPD') NULL;
