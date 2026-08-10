-- Rename `uhid` to `fileNumber`: reception now records the IPD/OPD file number for the
-- visit rather than a generic hospital UHID.
ALTER TABLE `Referral` RENAME COLUMN `uhid` TO `fileNumber`;

-- AlterTable
ALTER TABLE `Referral` ADD COLUMN `convertedAt` DATETIME(3) NULL;
