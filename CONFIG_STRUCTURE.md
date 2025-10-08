# 📊 Blast Session Config - JSON Structure Documentation

## 🎯 Case Anda: ContactDelay 30-40s tapi jadi 90-300s

### ❌ **BEFORE FIX (Bug)**
```json
{
  "config": {
    "contactDelay": {
      "min": 90,
      "max": 300
    },
    "comment": "Bug: Menggunakan default NEW account, user input diabaikan"
  }
}
```

**Log yang muncul:**
```
⏳ Applying contact delay: 271.8s (range: 90s-300s)
```

---

### ✅ **AFTER FIX (Sekarang)**
```json
{
  "config": {
    "contactDelay": {
      "min": 30,
      "max": 40
    },
    "comment": "Fixed: Menggunakan user input dari dashboard"
  }
}
```

**Log yang akan muncul:**
```
⏳ Applying contact delay: 35.2s (range: 30s-40s)
```

---

## 📦 Full JSON Config Structure

### **Complete Config Object** (yang disimpan di DB)

```json
{
  "messageDelay": {
    "min": 2,
    "max": 10,
    "description": "Delay antar API call dalam detik"
  },
  "contactDelay": {
    "min": 30,
    "max": 40,
    "description": "⭐ DELAY ANTAR KONTAK (ini yang Anda set 30-40s)"
  },
  "restDelay": {
    "min": 60,
    "max": 120,
    "description": "Durasi istirahat dalam menit (1-2 jam)"
  },
  "dailyLimit": {
    "min": 40,
    "max": 60,
    "description": "Batas harian pengiriman pesan"
  },
  "restThreshold": {
    "min": 15,
    "max": 25,
    "description": "Istirahat setelah kirim X pesan"
  },
  "businessHours": {
    "enabled": true,
    "startHour": 9,
    "endHour": 17,
    "excludeWeekends": true,
    "excludeLunchBreak": true,
    "lunchStart": 12,
    "lunchEnd": 13,
    "description": "Jam operasional kampanye (9 AM - 5 PM, skip weekend & lunch)"
  },
  "retryConfig": {
    "maxRetries": 3,
    "retryDelay": 60,
    "description": "Retry gagal 3x dengan delay 60 detik"
  },
  "accountAge": "NEW"
}
```

---

## 🔍 Breakdown Per Field

### 1️⃣ **messageDelay** (Delay API Call)
```json
"messageDelay": { "min": 2, "max": 10 }
```
- **Fungsi:** Delay antara setiap API call ke WhatsApp
- **Range:** 2-10 detik (random)
- **Default:** Sama untuk semua account age
- **Kapan dipakai:** Setiap kali hit WhatsApp API

---

### 2️⃣ **contactDelay** ⭐ (PALING PENTING - INI YANG BERMASALAH)
```json
"contactDelay": { "min": 30, "max": 40 }
```
- **Fungsi:** Delay antara mengirim ke kontak satu dengan kontak berikutnya
- **Range User Setting:** 30-40 detik (Anda set ini di dashboard)
- **Default by Account Age:**
  - NEW (0-7 hari): 90-300s (1.5-5 menit)
  - WARMING (8-30 hari): 60-180s (1-3 menit)
  - ESTABLISHED (30+ hari): 45-150s (45s-2.5 menit)
- **Kapan dipakai:** Setelah berhasil kirim ke 1 kontak, sebelum kirim ke kontak berikutnya
- **Log format:** 
  ```
  ⏳ Applying contact delay: 35.2s (range: 30s-40s)
  ```

---

### 3️⃣ **restDelay** (Durasi Istirahat)
```json
"restDelay": { "min": 60, "max": 120 }
```
- **Fungsi:** Berapa lama istirahat dalam MENIT
- **Range:** 60-120 menit (1-2 jam)
- **Default by Account Age:**
  - NEW: 60-120 menit
  - WARMING: 45-90 menit
  - ESTABLISHED: 30-60 menit
- **Kapan dipakai:** Saat mencapai restThreshold

---

### 4️⃣ **restThreshold** (Trigger Istirahat)
```json
"restThreshold": { "min": 15, "max": 25 }
```
- **Fungsi:** Istirahat setelah kirim berapa pesan
- **Range:** 15-25 pesan (random per session)
- **Default by Account Age:**
  - NEW: 15-25 pesan
  - WARMING: 25-40 pesan
  - ESTABLISHED: 40-60 pesan
- **Contoh:** Setelah kirim 18 pesan → istirahat 1.5 jam → lanjut lagi

---

### 5️⃣ **dailyLimit** (Batas Harian)
```json
"dailyLimit": { "min": 40, "max": 60 }
```
- **Fungsi:** Maksimal berapa pesan per hari
- **Range:** 40-60 pesan per hari
- **Default by Account Age:**
  - NEW: 40-60 pesan/hari (SANGAT HATI-HATI)
  - WARMING: 80-120 pesan/hari
  - ESTABLISHED: 150-200 pesan/hari
- **Kapan dipakai:** Sistem stop otomatis setelah mencapai limit harian

---

### 6️⃣ **businessHours** (Jam Kerja)
```json
"businessHours": {
  "enabled": true,
  "startHour": 9,
  "endHour": 17,
  "excludeWeekends": true,
  "excludeLunchBreak": true,
  "lunchStart": 12,
  "lunchEnd": 13
}
```
- **Fungsi:** Kampanye hanya jalan di jam kerja
- **Start:** 9 AM (09:00)
- **End:** 5 PM (17:00)
- **Skip:** Weekend & Lunch (12-1 PM)
- **Behavior:** 
  - Jika start di luar jam kerja → auto schedule ke jam kerja berikutnya
  - Jika sedang jalan dan keluar jam kerja → auto pause

---

### 7️⃣ **retryConfig** (Pengaturan Retry)
```json
"retryConfig": {
  "maxRetries": 3,
  "retryDelay": 60
}
```
- **Fungsi:** Retry pesan yang gagal
- **Max:** 3 kali percobaan
- **Delay:** 60 detik antar retry
- **Behavior:** Failed → tunggu 60s → retry → failed lagi → tunggu 60s → retry

---

## 🔄 Deep Merge Logic (Fix yang Kita Terapkan)

### **Cara Kerja:**

```javascript
// Input dari Dashboard (User)
const userConfig = {
  contactDelay: { min: 30, max: 40 },
  dailyLimit: { min: 100, max: 150 }
};

// Default berdasarkan Account Age (NEW)
const ageBasedConfig = {
  messageDelay: { min: 2, max: 10 },
  contactDelay: { min: 90, max: 300 },
  restDelay: { min: 60, max: 120 },
  dailyLimit: { min: 40, max: 60 },
  restThreshold: { min: 15, max: 25 },
  businessHours: { ... },
  retryConfig: { ... },
  accountAge: "NEW"
};

// SETELAH DEEP MERGE (User Priority)
const finalConfig = {
  messageDelay: { min: 2, max: 10 },          // ← dari default
  contactDelay: { min: 30, max: 40 },         // ✅ dari USER (override!)
  restDelay: { min: 60, max: 120 },           // ← dari default
  dailyLimit: { min: 100, max: 150 },         // ✅ dari USER (override!)
  restThreshold: { min: 15, max: 25 },        // ← dari default
  businessHours: { ... },                      // ← dari default
  retryConfig: { ... },                        // ← dari default
  accountAge: "NEW"
};
```

---

## 📊 Database Structure

### **Table:** `blast_sessions`

```sql
CREATE TABLE blast_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  whatsapp_session_id VARCHAR(255) NOT NULL,
  campaign_name VARCHAR(255),
  message_template TEXT,
  total_messages INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'IDLE',
  config JSONB,  -- ← INI YANG MENYIMPAN JSON CONFIG
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  paused_at TIMESTAMP,
  stopped_at TIMESTAMP
);
```

### **Sample Row:**
```json
{
  "id": 123,
  "session_id": "blast_1728367403715_abc123",
  "user_id": 1,
  "whatsapp_session_id": "6281234567890",
  "campaign_name": "Campaign Test October",
  "message_template": "Halo {{nama}}, apa kabar?",
  "total_messages": 100,
  "status": "RUNNING",
  "config": {
    "messageDelay": { "min": 2, "max": 10 },
    "contactDelay": { "min": 30, "max": 40 },
    "restDelay": { "min": 60, "max": 120 },
    "dailyLimit": { "min": 40, "max": 60 },
    "restThreshold": { "min": 15, "max": 25 },
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
  },
  "created_at": "2025-10-08T10:30:03.715Z",
  "started_at": "2025-10-08T10:35:12.523Z"
}
```

---

## 🧪 How to Test

### **1. Cek di Database (PostgreSQL)**
```sql
-- Lihat config dari session terbaru
SELECT 
  session_id,
  campaign_name,
  status,
  config->>'accountAge' as account_age,
  config->'contactDelay' as contact_delay,
  config->'dailyLimit' as daily_limit,
  created_at
FROM blast_sessions
ORDER BY created_at DESC
LIMIT 5;
```

### **2. Cek di Logs (Backend)**
```bash
# Saat create session
📊 Creating session with accountAge: NEW
  contactDelay: { min: 90, max: 300 }  ← DEFAULT
  
📊 User config applied:
  userContactDelay: { min: 30, max: 40 }  ← USER INPUT
  finalContactDelay: { min: 30, max: 40 }  ← MENANG! ✅

# Saat execution
⏳ Applying contact delay: 35.2s (range: 30s-40s)  ← BENAR! ✅
```

### **3. Cek di API Response**
```bash
GET /api/blast-control/sessions/:sessionId

Response:
{
  "sessionId": "blast_123",
  "status": "RUNNING",
  "config": {
    "contactDelay": { "min": 30, "max": 40 }  ← Harus sesuai input Anda
  }
}
```

---

## ✅ Checklist Verifikasi

- [ ] **Config tersimpan dengan benar di DB** (contactDelay: 30-40s)
- [ ] **Log menampilkan user config** (userContactDelay: { min: 30, max: 40 })
- [ ] **Log execution menggunakan range yang benar** (range: 30s-40s)
- [ ] **Actual delay match dengan setting** (35.2s bukan 271.8s)

---

## 🚀 Next Steps

1. **Restart backend** untuk apply fix
2. **Create new blast session** dengan contactDelay 30-40s
3. **Monitor logs** untuk verifikasi
4. **Cek database** untuk memastikan config tersimpan dengan benar

---

## 📞 Support

Jika masih ada masalah:
1. Share screenshot config dari dashboard
2. Share logs saat create session (📊 Creating session... dan 📊 User config applied...)
3. Share logs saat execution (⏳ Applying contact delay...)
4. Query database untuk cek config actual
