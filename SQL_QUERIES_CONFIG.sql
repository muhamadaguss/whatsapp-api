-- ============================================
-- BLAST SESSION CONFIG - SQL QUERIES
-- Quick reference untuk cek config di database
-- ============================================

-- 📊 1. Lihat Config dari Session Terbaru
-- ============================================
SELECT 
  session_id,
  campaign_name,
  status,
  total_messages,
  config->>'accountAge' as account_age,
  config->'contactDelay' as contact_delay,
  config->'dailyLimit' as daily_limit,
  config->'restDelay' as rest_delay,
  config->'restThreshold' as rest_threshold,
  created_at,
  started_at
FROM blast_sessions
ORDER BY created_at DESC
LIMIT 10;

-- Expected Output (AFTER FIX):
-- session_id                      | campaign_name      | status  | contact_delay         | account_age
-- blast_1728367403715_abc123      | Campaign Test      | RUNNING | {"min":30,"max":40}   | NEW
--                                                                  ↑ USER INPUT (30-40s) ✅


-- 📊 2. Cek HANYA Contact Delay dari Semua Session
-- ============================================
SELECT 
  session_id,
  campaign_name,
  status,
  config->'contactDelay'->>'min' as contact_delay_min,
  config->'contactDelay'->>'max' as contact_delay_max,
  CONCAT(
    config->'contactDelay'->>'min', 's - ', 
    config->'contactDelay'->>'max', 's'
  ) as delay_range,
  created_at
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Expected Output (AFTER FIX):
-- session_id                 | campaign_name | delay_range  | created_at
-- blast_1728367403715_abc123 | Campaign Test | 30s - 40s    | 2025-10-08 10:30:03 ✅
--                                             ↑ CORRECT!


-- 📊 3. Bandingkan Config User Input vs Default
-- ============================================
-- Note: Query ini untuk debugging, bandingkan apa yang tersimpan
SELECT 
  session_id,
  campaign_name,
  config->>'accountAge' as account_age,
  
  -- Contact Delay
  config->'contactDelay'->>'min' as user_contact_min,
  config->'contactDelay'->>'max' as user_contact_max,
  CASE config->>'accountAge'
    WHEN 'NEW' THEN '90-300 (default)'
    WHEN 'WARMING' THEN '60-180 (default)'
    WHEN 'ESTABLISHED' THEN '45-150 (default)'
  END as expected_default,
  
  -- Daily Limit
  config->'dailyLimit'->>'min' as user_daily_min,
  config->'dailyLimit'->>'max' as user_daily_max,
  CASE config->>'accountAge'
    WHEN 'NEW' THEN '40-60 (default)'
    WHEN 'WARMING' THEN '80-120 (default)'
    WHEN 'ESTABLISHED' THEN '150-200 (default)'
  END as expected_default_daily,
  
  created_at
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Expected Output (User set 30-40s):
-- account_age | user_contact_min | user_contact_max | expected_default  | Status
-- NEW         | 30               | 40               | 90-300 (default)  | ✅ User Override!
--             ↑ FROM USER        ↑ FROM USER         ↑ This is ignored


-- 📊 4. Cek Full Config (Pretty Print)
-- ============================================
SELECT 
  session_id,
  campaign_name,
  status,
  jsonb_pretty(config) as config_json
FROM blast_sessions
WHERE session_id = 'blast_XXXXX'  -- Ganti dengan session_id Anda
LIMIT 1;

-- Expected Output:
-- {
--   "messageDelay": { "min": 2, "max": 10 },
--   "contactDelay": { "min": 30, "max": 40 },  ← USER INPUT ✅
--   "restDelay": { "min": 60, "max": 120 },
--   "dailyLimit": { "min": 40, "max": 60 },
--   "restThreshold": { "min": 15, "max": 25 },
--   "businessHours": { ... },
--   "retryConfig": { ... },
--   "accountAge": "NEW"
-- }


-- 📊 5. Filter Session dengan Custom Contact Delay
-- ============================================
-- Cari session yang menggunakan custom contact delay (bukan default)
SELECT 
  session_id,
  campaign_name,
  config->>'accountAge' as account_age,
  config->'contactDelay'->>'min' as contact_min,
  config->'contactDelay'->>'max' as contact_max,
  CASE 
    WHEN config->>'accountAge' = 'NEW' 
      AND (config->'contactDelay'->>'min')::int != 90 
    THEN '✅ Custom (not default 90-300)'
    WHEN config->>'accountAge' = 'WARMING' 
      AND (config->'contactDelay'->>'min')::int != 60 
    THEN '✅ Custom (not default 60-180)'
    WHEN config->>'accountAge' = 'ESTABLISHED' 
      AND (config->'contactDelay'->>'min')::int != 45 
    THEN '✅ Custom (not default 45-150)'
    ELSE '⚠️ Using default'
  END as config_type
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;


-- 📊 6. Count Sessions by Config Type
-- ============================================
SELECT 
  config->>'accountAge' as account_age,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (
    WHERE config->'contactDelay'->>'min' != '90'
      AND config->>'accountAge' = 'NEW'
  ) as custom_config_new,
  COUNT(*) FILTER (
    WHERE config->'contactDelay'->>'min' = '90'
      AND config->>'accountAge' = 'NEW'
  ) as default_config_new
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY config->>'accountAge';


-- 📊 7. Trace Config Changes (untuk debugging)
-- ============================================
-- Jika ada updated_at dan Anda ingin lihat history perubahan
SELECT 
  session_id,
  campaign_name,
  config->'contactDelay' as contact_delay,
  created_at,
  updated_at,
  CASE 
    WHEN updated_at > created_at 
    THEN '⚠️ Config diubah setelah dibuat'
    ELSE '✅ Config original'
  END as config_status
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;


-- 📊 8. Verify Fix - Cek Contact Delay yang "Salah"
-- ============================================
-- Query untuk find session yang masih menggunakan default padahal seharusnya custom
-- (Hanya relevant SEBELUM fix, setelah fix seharusnya tidak ada)
SELECT 
  session_id,
  campaign_name,
  status,
  config->'contactDelay'->>'min' as contact_min,
  config->'contactDelay'->>'max' as contact_max,
  created_at,
  CASE 
    WHEN (config->'contactDelay'->>'min')::int >= 90 
    THEN '❌ BUG: Using default (90+s) - should be user input!'
    ELSE '✅ OK: Using user input (< 90s)'
  END as verification
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND config->>'accountAge' = 'NEW'
ORDER BY created_at DESC;

-- Expected AFTER FIX:
-- All rows should show: ✅ OK: Using user input


-- 📊 9. Performance - Average Contact Delay by Account Age
-- ============================================
SELECT 
  config->>'accountAge' as account_age,
  COUNT(*) as total_sessions,
  AVG((config->'contactDelay'->>'min')::int) as avg_min_delay,
  AVG((config->'contactDelay'->>'max')::int) as avg_max_delay,
  MIN((config->'contactDelay'->>'min')::int) as lowest_min_delay,
  MAX((config->'contactDelay'->>'max')::int) as highest_max_delay
FROM blast_sessions
WHERE status IN ('RUNNING', 'COMPLETED')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY config->>'accountAge'
ORDER BY account_age;


-- 📊 10. Export Config untuk Documentation
-- ============================================
-- Export semua distinct configs yang digunakan
SELECT DISTINCT
  config->>'accountAge' as account_age,
  config->'contactDelay' as contact_delay,
  config->'dailyLimit' as daily_limit,
  config->'restDelay' as rest_delay,
  COUNT(*) OVER (
    PARTITION BY config->'contactDelay', config->>'accountAge'
  ) as usage_count
FROM blast_sessions
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY account_age, usage_count DESC;


-- ============================================
-- QUICK CHECKS (Copy-Paste Ready)
-- ============================================

-- ✅ Quick Check: Last 5 Sessions Contact Delay
SELECT session_id, config->'contactDelay' as contact_delay FROM blast_sessions ORDER BY created_at DESC LIMIT 5;

-- ✅ Quick Check: Your Specific Session
SELECT config->'contactDelay' FROM blast_sessions WHERE session_id = 'blast_XXXXX';

-- ✅ Quick Check: Count Sessions with Custom Config
SELECT COUNT(*) FROM blast_sessions WHERE (config->'contactDelay'->>'min')::int < 90 AND created_at > NOW() - INTERVAL '24 hours';

-- ✅ Quick Check: Show Config for Running Sessions
SELECT session_id, status, config->'contactDelay' FROM blast_sessions WHERE status = 'RUNNING';


-- ============================================
-- TROUBLESHOOTING QUERIES
-- ============================================

-- 🔍 Find sessions with WRONG delay (should not exist after fix)
SELECT session_id, campaign_name, config->'contactDelay' 
FROM blast_sessions 
WHERE (config->'contactDelay'->>'min')::int > 60  -- Assuming user always sets < 60s
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 🔍 Find sessions created TODAY
SELECT session_id, campaign_name, config->'contactDelay', created_at 
FROM blast_sessions 
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- 🔍 Show ALL config fields
SELECT session_id, jsonb_pretty(config) 
FROM blast_sessions 
ORDER BY created_at DESC 
LIMIT 1;
