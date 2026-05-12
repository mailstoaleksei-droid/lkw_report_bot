-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "planning";

-- CreateEnum
CREATE TYPE "planning"."RoleName" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER', 'MANAGER');

-- CreateEnum
CREATE TYPE "planning"."MasterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD', 'RETURNED', 'WORKSHOP', 'RESERVE', 'DISMISSED', 'VACATION', 'SICK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "planning"."OrderStatus" AS ENUM ('OPEN', 'PLANNED', 'PROBLEM', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "planning"."ImportStatus" AS ENUM ('PREVIEW', 'VALIDATED', 'EXECUTED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "planning"."AuditEventType" AS ENUM ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_DELETED', 'LKW_ASSIGNED', 'DRIVER_ASSIGNED', 'CHASSIS_ASSIGNED', 'ASSIGNMENT_UPDATED', 'STATUS_CHANGED', 'IMPORT_EXECUTED', 'USER_CREATED', 'USER_ROLE_CHANGED', 'EXPORT_CREATED');

-- CreateTable
CREATE TABLE "planning"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "planning"."RoleName" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Lkw" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "number" TEXT NOT NULL,
    "type" TEXT,
    "companyId" TEXT,
    "status" "planning"."MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "rawStatus" TEXT,
    "statusSince" TIMESTAMP(3),
    "soldDate" TIMESTAMP(3),
    "returnedDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceRowHash" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lkw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."LkwAlias" (
    "id" TEXT NOT NULL,
    "lkwId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LkwAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Driver" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "fullName" TEXT NOT NULL,
    "surname" TEXT,
    "phone" TEXT,
    "companyId" TEXT,
    "status" "planning"."MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "rawStatus" TEXT,
    "dismissedDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "telegramLookupHint" TEXT,
    "sourceRowHash" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."DriverAvailability" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "planning"."MasterStatus" NOT NULL,
    "rawStatus" TEXT,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "importRunId" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Chassis" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "number" TEXT NOT NULL,
    "status" "planning"."MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "rawStatus" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chassis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Order" (
    "id" TEXT NOT NULL,
    "planningDate" TIMESTAMP(3) NOT NULL,
    "runde" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "customer" TEXT,
    "plz" TEXT,
    "city" TEXT,
    "country" TEXT,
    "plannedTime" TEXT,
    "info" TEXT,
    "tourType" TEXT,
    "externalOrderId" TEXT,
    "status" "planning"."OrderStatus" NOT NULL DEFAULT 'OPEN',
    "problemReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Assignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lkwId" TEXT,
    "driverId" TEXT,
    "chassisId" TEXT,
    "planningDate" TIMESTAMP(3) NOT NULL,
    "runde" INTEGER NOT NULL,
    "status" "planning"."OrderStatus" NOT NULL DEFAULT 'PLANNED',
    "problemReason" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "isNational" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."AuditLog" (
    "id" TEXT NOT NULL,
    "eventType" "planning"."AuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "orderId" TEXT,
    "assignmentId" TEXT,
    "userId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."ImportRun" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceFileHash" TEXT,
    "status" "planning"."ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "previewPayload" JSONB NOT NULL DEFAULT '{}',
    "validationStats" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."DailyPlanImportRow" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "planningDate" TIMESTAMP(3),
    "wagenRaw" TEXT,
    "lkwNumberRaw" TEXT,
    "lkwId" TEXT,
    "runde" INTEGER,
    "auftragText" TEXT,
    "plz" TEXT,
    "country" TEXT,
    "info" TEXT,
    "statusRaw" TEXT,
    "normalizedStatus" "planning"."OrderStatus",
    "validationCode" TEXT,
    "validationMessage" TEXT,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlanImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."ImportError" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "fieldName" TEXT,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."ExportLog" (
    "id" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "outputPath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "planning"."TelegramAccount" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "driverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning"."ExternalOrderMapping" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalSystem" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "planning"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "planning"."User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "planning"."User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "planning"."Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Lkw_externalId_key" ON "planning"."Lkw"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lkw_number_key" ON "planning"."Lkw"("number");

-- CreateIndex
CREATE INDEX "Lkw_companyId_idx" ON "planning"."Lkw"("companyId");

-- CreateIndex
CREATE INDEX "Lkw_status_idx" ON "planning"."Lkw"("status");

-- CreateIndex
CREATE INDEX "Lkw_isActive_idx" ON "planning"."Lkw"("isActive");

-- CreateIndex
CREATE INDEX "Lkw_createdAt_idx" ON "planning"."Lkw"("createdAt");

-- CreateIndex
CREATE INDEX "Lkw_updatedAt_idx" ON "planning"."Lkw"("updatedAt");

-- CreateIndex
CREATE INDEX "LkwAlias_lkwId_idx" ON "planning"."LkwAlias"("lkwId");

-- CreateIndex
CREATE INDEX "LkwAlias_alias_idx" ON "planning"."LkwAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "LkwAlias_alias_source_key" ON "planning"."LkwAlias"("alias", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_externalId_key" ON "planning"."Driver"("externalId");

-- CreateIndex
CREATE INDEX "Driver_companyId_idx" ON "planning"."Driver"("companyId");

-- CreateIndex
CREATE INDEX "Driver_surname_idx" ON "planning"."Driver"("surname");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "planning"."Driver"("status");

-- CreateIndex
CREATE INDEX "Driver_isActive_idx" ON "planning"."Driver"("isActive");

-- CreateIndex
CREATE INDEX "Driver_createdAt_idx" ON "planning"."Driver"("createdAt");

-- CreateIndex
CREATE INDEX "Driver_updatedAt_idx" ON "planning"."Driver"("updatedAt");

-- CreateIndex
CREATE INDEX "DriverAvailability_date_idx" ON "planning"."DriverAvailability"("date");

-- CreateIndex
CREATE INDEX "DriverAvailability_driverId_date_idx" ON "planning"."DriverAvailability"("driverId", "date");

-- CreateIndex
CREATE INDEX "DriverAvailability_status_idx" ON "planning"."DriverAvailability"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAvailability_driverId_date_source_key" ON "planning"."DriverAvailability"("driverId", "date", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Chassis_externalId_key" ON "planning"."Chassis"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Chassis_number_key" ON "planning"."Chassis"("number");

-- CreateIndex
CREATE INDEX "Chassis_status_idx" ON "planning"."Chassis"("status");

-- CreateIndex
CREATE INDEX "Order_planningDate_idx" ON "planning"."Order"("planningDate");

-- CreateIndex
CREATE INDEX "Order_runde_idx" ON "planning"."Order"("runde");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "planning"."Order"("status");

-- CreateIndex
CREATE INDEX "Order_externalOrderId_idx" ON "planning"."Order"("externalOrderId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "planning"."Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_updatedAt_idx" ON "planning"."Order"("updatedAt");

-- CreateIndex
CREATE INDEX "Assignment_planningDate_idx" ON "planning"."Assignment"("planningDate");

-- CreateIndex
CREATE INDEX "Assignment_planningDate_runde_lkwId_idx" ON "planning"."Assignment"("planningDate", "runde", "lkwId");

-- CreateIndex
CREATE INDEX "Assignment_lkwId_idx" ON "planning"."Assignment"("lkwId");

-- CreateIndex
CREATE INDEX "Assignment_driverId_idx" ON "planning"."Assignment"("driverId");

-- CreateIndex
CREATE INDEX "Assignment_chassisId_idx" ON "planning"."Assignment"("chassisId");

-- CreateIndex
CREATE INDEX "Assignment_runde_idx" ON "planning"."Assignment"("runde");

-- CreateIndex
CREATE INDEX "Assignment_status_idx" ON "planning"."Assignment"("status");

-- CreateIndex
CREATE INDEX "Assignment_createdAt_idx" ON "planning"."Assignment"("createdAt");

-- CreateIndex
CREATE INDEX "Assignment_updatedAt_idx" ON "planning"."Assignment"("updatedAt");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "planning"."Holiday"("date");

-- CreateIndex
CREATE INDEX "Holiday_region_idx" ON "planning"."Holiday"("region");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_region_name_key" ON "planning"."Holiday"("date", "region", "name");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "planning"."AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "planning"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_orderId_idx" ON "planning"."AuditLog"("orderId");

-- CreateIndex
CREATE INDEX "AuditLog_assignmentId_idx" ON "planning"."AuditLog"("assignmentId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "planning"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "planning"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportRun_sourceType_idx" ON "planning"."ImportRun"("sourceType");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "planning"."ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportRun_createdAt_idx" ON "planning"."ImportRun"("createdAt");

-- CreateIndex
CREATE INDEX "DailyPlanImportRow_importRunId_idx" ON "planning"."DailyPlanImportRow"("importRunId");

-- CreateIndex
CREATE INDEX "DailyPlanImportRow_planningDate_idx" ON "planning"."DailyPlanImportRow"("planningDate");

-- CreateIndex
CREATE INDEX "DailyPlanImportRow_lkwId_idx" ON "planning"."DailyPlanImportRow"("lkwId");

-- CreateIndex
CREATE INDEX "DailyPlanImportRow_runde_idx" ON "planning"."DailyPlanImportRow"("runde");

-- CreateIndex
CREATE INDEX "DailyPlanImportRow_normalizedStatus_idx" ON "planning"."DailyPlanImportRow"("normalizedStatus");

-- CreateIndex
CREATE INDEX "ImportError_importRunId_idx" ON "planning"."ImportError"("importRunId");

-- CreateIndex
CREATE INDEX "ImportError_severity_idx" ON "planning"."ImportError"("severity");

-- CreateIndex
CREATE INDEX "ExportLog_exportType_idx" ON "planning"."ExportLog"("exportType");

-- CreateIndex
CREATE INDEX "ExportLog_format_idx" ON "planning"."ExportLog"("format");

-- CreateIndex
CREATE INDEX "ExportLog_createdAt_idx" ON "planning"."ExportLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccount_telegramUserId_key" ON "planning"."TelegramAccount"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramAccount_driverId_idx" ON "planning"."TelegramAccount"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrderMapping_orderId_key" ON "planning"."ExternalOrderMapping"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrderMapping_externalSystem_externalOrderId_key" ON "planning"."ExternalOrderMapping"("externalSystem", "externalOrderId");

-- AddForeignKey
ALTER TABLE "planning"."Lkw" ADD CONSTRAINT "Lkw_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "planning"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."LkwAlias" ADD CONSTRAINT "LkwAlias_lkwId_fkey" FOREIGN KEY ("lkwId") REFERENCES "planning"."Lkw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."Driver" ADD CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "planning"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."DriverAvailability" ADD CONSTRAINT "DriverAvailability_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "planning"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."DriverAvailability" ADD CONSTRAINT "DriverAvailability_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "planning"."ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."Assignment" ADD CONSTRAINT "Assignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "planning"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."Assignment" ADD CONSTRAINT "Assignment_lkwId_fkey" FOREIGN KEY ("lkwId") REFERENCES "planning"."Lkw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."Assignment" ADD CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "planning"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."Assignment" ADD CONSTRAINT "Assignment_chassisId_fkey" FOREIGN KEY ("chassisId") REFERENCES "planning"."Chassis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."AuditLog" ADD CONSTRAINT "AuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "planning"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."AuditLog" ADD CONSTRAINT "AuditLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "planning"."Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "planning"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."ImportRun" ADD CONSTRAINT "ImportRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "planning"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."DailyPlanImportRow" ADD CONSTRAINT "DailyPlanImportRow_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "planning"."ImportRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."ImportError" ADD CONSTRAINT "ImportError_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "planning"."ImportRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."ExportLog" ADD CONSTRAINT "ExportLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "planning"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."TelegramAccount" ADD CONSTRAINT "TelegramAccount_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "planning"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning"."ExternalOrderMapping" ADD CONSTRAINT "ExternalOrderMapping_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "planning"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

