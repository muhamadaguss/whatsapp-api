-- Manual migration to add messageType and mediaUrl columns
-- Run this SQL directly in your PostgreSQL database

-- Add messageType column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chat_messages' AND column_name = 'messageType') THEN
        ALTER TABLE chat_messages ADD COLUMN "messageType" VARCHAR(255) DEFAULT 'text' NOT NULL;
        RAISE NOTICE 'Added messageType column';
    ELSE
        RAISE NOTICE 'messageType column already exists';
    END IF;
END $$;

-- Add mediaUrl column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chat_messages' AND column_name = 'mediaUrl') THEN
        ALTER TABLE chat_messages ADD COLUMN "mediaUrl" TEXT;
        RAISE NOTICE 'Added mediaUrl column';
    ELSE
        RAISE NOTICE 'mediaUrl column already exists';
    END IF;
END $$;