-- CreateTable
CREATE TABLE "battle_match_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "battleMode" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE "battle_timeline_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerSeat" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "cards" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "speech" TEXT,
    "decisionInsight" TEXT,
    "stateSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battle_timeline_records_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "battle_match_records" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "battle_timeline_records_matchId_stepNumber_key" ON "battle_timeline_records"("matchId", "stepNumber");
