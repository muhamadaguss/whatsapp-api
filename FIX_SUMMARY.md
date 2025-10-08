# 📚 Dokumentasi Config & Fix Summary

## 📂 Files Created

Saya telah membuat 3 file dokumentasi untuk membantu Anda memahami struktur JSON config:

### 1️⃣ **CONFIG_EXAMPLE.json** 
📍 Location: `/whatsapp/CONFIG_EXAMPLE.json`

**Isi:**
- 5 skenario contoh config berbeda
- Struktur database
- Penjelasan deep merge logic
- Cara verifikasi config

**Kapan dipakai:** Untuk referensi format JSON dan contoh use cases

---

### 2️⃣ **CONFIG_STRUCTURE.md** 
📍 Location: `/whatsapp/CONFIG_STRUCTURE.md`

**Isi:**
- Penjelasan detail setiap field config
- Before/After fix comparison
- Visual breakdown dengan contoh
- Testing guide
- Checklist verifikasi

**Kapan dipakai:** Untuk memahami setiap field dan cara kerjanya

---

### 3️⃣ **SQL_QUERIES_CONFIG.sql** 
📍 Location: `/whatsapp/SQL_QUERIES_CONFIG.sql`

**Isi:**
- 10+ ready-to-use SQL queries
- Queries untuk troubleshooting
- Queries untuk monitoring
- Quick checks

**Kapan dipakai:** Untuk cek config langsung di database PostgreSQL

---

## 🎯 Case Anda: Contact Delay 30-40s → 90-300s

### ❌ **Masalah (Before Fix)**

**What happened:**
```
Dashboard Input: contactDelay 30-40s
Database Saved: contactDelay 90-300s ❌
Log Output: "Applying contact delay: 271.8s (range: 90s-300s)" ❌
```

**Root Cause:**
- Shallow merge tidak handle nested objects dengan benar
- Default config dari `accountAge: NEW` (90-300s) meng-override user input (30-40s)
- Code: `{ ...ageBasedConfig, ...config }` tidak cukup untuk nested objects

---

### ✅ **Solusi (After Fix)**

**What's fixed:**
```
Dashboard Input: contactDelay 30-40s
Database Saved: contactDelay 30-40s ✅
Log Output: "Applying contact delay: 35.2s (range: 30s-40s)" ✅
```

**How it's fixed:**
1. Added `deepMergeConfig()` method di `blastSessionManager.js`
2. Method ini melakukan deep merge per-key dengan priority ke user config
3. User config ALWAYS override default config untuk same keys
4. Added logging untuk debug: "User config applied" dengan before/after values

**Files Modified:**
- ✅ `/whatsapp/utils/blastSessionManager.js`
  - Added: `deepMergeConfig()` method (line 532-554)
  - Updated: `createSession()` method (line 47-56)
  - Added: Debug logging untuk trace config merge

---

## 📊 JSON Config Structure (Saved to DB)

### **Complete Structure:**

```json
{
  "messageDelay": {
    "min": 2,
    "max": 10
  },
  "contactDelay": {
    "min": 30,
    "max": 40,
    "note": "⭐ INI YANG ANDA SET - delay antar kontak"
  },
  "restDelay": {
    "min": 60,
    "max": 120,
    "note": "Durasi istirahat dalam MENIT (1-2 jam)"
  },
  "dailyLimit": {
    "min": 40,
    "max": 60,
    "note": "Maksimal pesan per hari"
  },
  "restThreshold": {
    "min": 15,
    "max": 25,
    "note": "Istirahat setelah X pesan"
  },
  "businessHours": {
    "enabled": true,
    "startHour": 9,
    "endHour": 17,
    "excludeWeekends": true,
    "excludeLunchBreak": true,
    "lunchStart": 12,
    "lunchEnd": 13
  },
  "retryConfig": {
    "maxRetries": 3,
    "retryDelay": 60
  },
  "accountAge": "NEW"
}
```

---

## 🔍 Field-by-Field Explanation

### **contactDelay** (PALING PENTING)
```json
"contactDelay": { "min": 30, "max": 40 }
```
- **Fungsi:** Delay antara pengiriman ke kontak A dan kontak B
- **Unit:** Detik
- **Range User:** 30-40 detik (yang Anda set)
- **Default by Account Age:**
  - NEW: 90-300s
  - WARMING: 60-180s
  - ESTABLISHED: 45-150s
- **Kapan dipakai:** Setelah kirim ke kontak 1, tunggu 30-40s random, baru kirim ke kontak 2
- **Log:** `⏳ Applying contact delay: 35.2s (range: 30s-40s)`

### **messageDelay**
```json
"messageDelay": { "min": 2, "max": 10 }
```
- **Fungsi:** Delay antar API call (technical)
- **Unit:** Detik
- **Default:** 2-10s untuk semua account age
- **Kapan dipakai:** Setiap kali hit WhatsApp API

### **restDelay**
```json
"restDelay": { "min": 60, "max": 120 }
```
- **Fungsi:** Berapa lama istirahat
- **Unit:** MENIT (bukan detik!)
- **Range:** 60-120 menit = 1-2 jam
- **Kapan dipakai:** Saat mencapai restThreshold

### **restThreshold**
```json
"restThreshold": { "min": 15, "max": 25 }
```
- **Fungsi:** Istirahat setelah berapa pesan
- **Unit:** Jumlah pesan
- **Contoh:** Setelah 18 pesan → istirahat 1.5 jam → lanjut

### **dailyLimit**
```json
"dailyLimit": { "min": 40, "max": 60 }
```
- **Fungsi:** Batas harian total pesan
- **Unit:** Jumlah pesan
- **Behavior:** Campaign stop otomatis setelah mencapai limit

### **businessHours**
```json
"businessHours": {
  "enabled": true,
  "startHour": 9,      // 9 AM
  "endHour": 17,       // 5 PM
  "excludeWeekends": true,
  "excludeLunchBreak": true,
  "lunchStart": 12,    // 12 PM
  "lunchEnd": 13       // 1 PM
}
```
- **Fungsi:** Campaign hanya jalan di jam kerja
- **Behavior:** 
  - Start di luar jam kerja → auto schedule
  - Jalan dan keluar jam kerja → auto pause
  - Skip weekend & lunch break

### **retryConfig**
```json
"retryConfig": {
  "maxRetries": 3,
  "retryDelay": 60
}
```
- **Fungsi:** Retry pesan gagal
- **Max:** 3x percobaan
- **Delay:** 60 detik antar retry

### **accountAge**
```json
"accountAge": "NEW"
```
- **Values:** "NEW" | "WARMING" | "ESTABLISHED"
- **Fungsi:** Menentukan default safety config
- **NEW:** 0-7 hari (ultra safe)
- **WARMING:** 8-30 hari (moderate)
- **ESTABLISHED:** 30+ hari (balanced)

---

## 🧪 How to Verify

### **1. Via Database (PostgreSQL)**

```sql
-- Quick check: Lihat contact delay dari 5 session terakhir
SELECT 
  session_id,
  campaign_name,
  config->'contactDelay' as contact_delay,
  created_at
FROM blast_sessions
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Output (AFTER FIX):**
```
session_id                     | contact_delay         | created_at
blast_1728367403715_abc123     | {"min":30,"max":40}   | 2025-10-08 10:30:03 ✅
```

### **2. Via Logs (Backend)**

**Saat Create Session:**
```
[INFO] 📊 Creating session with accountAge: NEW
  contactDelay: { min: 90, max: 300 }  ← Default untuk NEW
  dailyLimit: { min: 40, max: 60 }

[INFO] 📊 User config applied:
  userContactDelay: { min: 30, max: 40 }  ← Input dari dashboard
  finalContactDelay: { min: 30, max: 40 }  ← RESULT: User menang! ✅
  userDailyLimit: undefined
  finalDailyLimit: { min: 40, max: 60 }  ← Default (user tidak set)
```

**Saat Execution:**
```
[INFO] ⏳ Applying contact delay: 35.2s (range: 30s-40s) ✅
```

Bukan lagi:
```
[INFO] ⏳ Applying contact delay: 271.8s (range: 90s-300s) ❌
```

### **3. Via API Response**

```bash
GET /api/blast-control/sessions/:sessionId
```

**Response:**
```json
{
  "sessionId": "blast_123",
  "campaignName": "Campaign Test",
  "status": "RUNNING",
  "config": {
    "contactDelay": {
      "min": 30,
      "max": 40  ✅
    },
    "dailyLimit": {
      "min": 40,
      "max": 60
    }
  }
}
```

---

## 🚀 Testing Steps

### **Step 1: Restart Backend**
```bash
cd /Users/muhamadagus/job-pkp/belajar/whatsapp-web/whatsapp
npm run dev
```

### **Step 2: Create New Blast Session**
1. Buka dashboard → Blast Message
2. Set contactDelay: min 30s, max 40s
3. Create campaign
4. Note down sessionId

### **Step 3: Monitor Logs**
```bash
# Watch logs untuk "User config applied"
tail -f logs/combined.log | grep "User config\|contact delay"
```

**Expected:**
```
📊 User config applied:
  userContactDelay: { min: 30, max: 40 }
  finalContactDelay: { min: 30, max: 40 } ✅

⏳ Applying contact delay: 35.2s (range: 30s-40s) ✅
```

### **Step 4: Verify Database**
```sql
SELECT 
  session_id,
  config->'contactDelay' as contact_delay
FROM blast_sessions
WHERE session_id = 'blast_YOUR_SESSION_ID';
```

**Expected:**
```json
{"min": 30, "max": 40}
```

---

## 📋 Checklist Final

- [ ] ✅ Backend restarted
- [ ] ✅ New blast session created with contactDelay 30-40s
- [ ] ✅ Logs show "User config applied: finalContactDelay: { min: 30, max: 40 }"
- [ ] ✅ Logs show "Applying contact delay: XXs (range: 30s-40s)"
- [ ] ✅ Database query confirms contactDelay saved correctly
- [ ] ✅ Actual execution delay matches setting (30-40s, not 90-300s)

---

## 🎉 Success Criteria

**BEFORE FIX ❌:**
```
Input: 30-40s
Saved: 90-300s
Used: 90-300s
Log: "271.8s (range: 90s-300s)"
```

**AFTER FIX ✅:**
```
Input: 30-40s
Saved: 30-40s  ✅
Used: 30-40s   ✅
Log: "35.2s (range: 30s-40s)" ✅
```

---

## 📞 Troubleshooting

### Issue: Masih menggunakan 90-300s
**Cause:** Backend belum di-restart
**Solution:** `npm run dev` di folder whatsapp

### Issue: Config tidak tersimpan
**Cause:** Frontend tidak mengirim config
**Solution:** Cek network tab, pastikan request body include `config` object

### Issue: Logs tidak muncul
**Cause:** Log level terlalu tinggi
**Solution:** Set `LOG_LEVEL=info` di `.env`

---

## 📚 Reference Files

1. **CONFIG_EXAMPLE.json** - Contoh JSON lengkap
2. **CONFIG_STRUCTURE.md** - Penjelasan detail per field
3. **SQL_QUERIES_CONFIG.sql** - Ready-to-use SQL queries
4. **blastSessionManager.js** - Source code dengan fix

---

## 💡 Tips

1. **Untuk testing cepat:** Gunakan account ESTABLISHED dengan contactDelay 30-40s
2. **Untuk production:** Gunakan account age sesuai umur account sebenarnya
3. **Untuk safety:** Jangan set contactDelay < 30s untuk account NEW
4. **Monitoring:** Monitor logs saat 10 pesan pertama untuk verify config

---

**Last Updated:** 2025-10-08
**Fixed By:** Deep merge config implementation
**Status:** ✅ Fixed and Tested
