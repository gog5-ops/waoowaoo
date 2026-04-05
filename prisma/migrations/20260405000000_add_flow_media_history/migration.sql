-- CreateTable
CREATE TABLE `flow_media_history` (
    `id` VARCHAR(191) NOT NULL,
    `flowProjectId` VARCHAR(191) NOT NULL,
    `mediaType` VARCHAR(191) NOT NULL,
    `flowMediaId` VARCHAR(191) NOT NULL,
    `sourceTaskId` VARCHAR(191) NULL,
    `prompt` TEXT NULL,
    `model` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `flow_media_history_flowProjectId_idx`(`flowProjectId`),
    INDEX `flow_media_history_flowMediaId_idx`(`flowMediaId`),
    INDEX `flow_media_history_sourceTaskId_idx`(`sourceTaskId`),
    INDEX `flow_media_history_flowProjectId_mediaType_idx`(`flowProjectId`, `mediaType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
