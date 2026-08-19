-- CreateTable
CREATE TABLE `MarketingPerson` (
    `id` VARCHAR(191) NOT NULL,
    `hospitalId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Doctor` ADD COLUMN `marketingPersonId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `MarketingPerson` ADD CONSTRAINT `MarketingPerson_hospitalId_fkey` FOREIGN KEY (`hospitalId`) REFERENCES `Hospital`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Doctor` ADD CONSTRAINT `Doctor_marketingPersonId_fkey` FOREIGN KEY (`marketingPersonId`) REFERENCES `MarketingPerson`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: turn each distinct existing free-text `marketingPersonName` value (per
-- hospital) into a real MarketingPerson row, then point every matching Doctor at it via the
-- new `marketingPersonId` column. The old `marketingPersonName` text column is left in place
-- afterward (unused going forward) rather than dropped, so nothing is destroyed if anything
-- here needs to be double-checked later.
INSERT INTO `MarketingPerson` (`id`, `hospitalId`, `name`, `active`, `createdAt`)
SELECT UUID(), src.hospitalId, src.marketingPersonName, true, NOW()
FROM (
    SELECT DISTINCT hospitalId, TRIM(marketingPersonName) AS marketingPersonName
    FROM `Doctor`
    WHERE marketingPersonName IS NOT NULL AND TRIM(marketingPersonName) <> ''
) AS src;

UPDATE `Doctor` d
JOIN `MarketingPerson` mp
  ON mp.hospitalId = d.hospitalId AND mp.name = TRIM(d.marketingPersonName)
SET d.marketingPersonId = mp.id
WHERE d.marketingPersonName IS NOT NULL AND TRIM(d.marketingPersonName) <> '';
