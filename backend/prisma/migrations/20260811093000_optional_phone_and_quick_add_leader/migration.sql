-- AlterTable
-- Doctor.phone becomes optional: reception can quick-add a leader by name only, from the
-- "Add patient" screen, without knowing their phone number yet.
ALTER TABLE `Doctor` MODIFY COLUMN `phone` VARCHAR(191) NULL;
