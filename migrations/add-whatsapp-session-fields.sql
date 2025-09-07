-- Migration: Add WhatsApp session enhancement fields
-- Date: 2025-09-07
-- Purpose: Enhance sessions table for WhatsApp account information display

-- Add new fields to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_picture TEXT,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS connection_quality VARCHAR(20) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create enum type for connection quality if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_quality_enum') THEN
        CREATE TYPE connection_quality_enum AS ENUM ('excellent', 'good', 'poor', 'unknown');
    END IF;
END $$;

-- Update connection_quality column to use enum
ALTER TABLE sessions 
ALTER COLUMN connection_quality TYPE connection_quality_enum 
USING connection_quality::connection_quality_enum;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_phone_number ON sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_blast_sessions_whatsapp_session_id ON blast_sessions(whatsapp_session_id);

-- Update existing records to have default values
UPDATE sessions 
SET 
    connection_quality = 'unknown'::connection_quality_enum,
    metadata = '{}'::jsonb
WHERE connection_quality IS NULL OR metadata IS NULL;

-- Add comment to track migration
COMMENT ON COLUMN sessions.display_name IS 'Display name for WhatsApp account';
COMMENT ON COLUMN sessions.profile_picture IS 'Base64 encoded profile picture';
COMMENT ON COLUMN sessions.last_seen IS 'Last activity timestamp';
COMMENT ON COLUMN sessions.connection_quality IS 'Connection quality indicator';
COMMENT ON COLUMN sessions.metadata IS 'Additional metadata in JSON format';
