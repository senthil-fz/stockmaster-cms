-- Add a nullable suspension timestamp to User.
-- null = active; when set, the account is suspended (login + token refresh are rejected).
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
