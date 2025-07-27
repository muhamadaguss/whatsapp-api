# Chart Endpoints Documentation

## Overview
Dokumentasi ini menjelaskan endpoint baru yang ditambahkan untuk mendukung chart "Message Delivery Trends" dan "Message Type Performance" di dashboard wa-flow-manager.

## Endpoints

### 1. Get Message Trends
**Endpoint:** `POST /campaign/getMessageTrends`

**Description:** Mengambil data trend pengiriman pesan berdasarkan periode waktu.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "period": "today" | "weekly" | "monthly"
}
```

**Response:**
```json
{
  "status": "success",
  "trends": [
    {
      "name": "Day 1", // atau "Mon", "0:00" tergantung period
      "success": 150,
      "failed": 10,
      "total": 160
    },
    // ... data lainnya
  ]
}
```

**Period Behavior:**
- `today`: Data per jam (0:00 - 23:00)
- `weekly`: Data per hari (Mon - Sun)
- `monthly`: Data per hari dalam bulan (Day 1 - Day 31)

### 2. Get Message Type Performance
**Endpoint:** `POST /campaign/getMessageTypePerformance`

**Description:** Mengambil data performa berdasarkan tipe pesan.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "period": "today" | "weekly" | "monthly"
}
```

**Response:**
```json
{
  "status": "success",
  "performance": [
    {
      "name": "Promo",
      "success": 85, // percentage
      "failed": 15,  // percentage
      "totalMessages": 1000
    },
    {
      "name": "Updates",
      "success": 92,
      "failed": 8,
      "totalMessages": 500
    },
    // ... data untuk Welcome, Reminder, Support
  ]
}
```

**Message Type Categories:**
Pesan dikategorikan berdasarkan kata kunci dalam `messageTemplate`:

- **Promo**: mengandung "promo", "diskon", "sale", "offer"
- **Updates**: mengandung "update", "info", "news"
- **Reminder**: mengandung "reminder", "ingat", "deadline"
- **Welcome**: mengandung "welcome", "selamat datang", "halo"
- **Support**: kategori default untuk pesan lainnya

## Error Handling

Kedua endpoint menggunakan middleware `asyncHandler` dan akan mengembalikan error response standar:

```json
{
  "status": "error",
  "message": "Error description"
}
```

## Authentication

Kedua endpoint memerlukan JWT token yang valid melalui middleware `verifyToken`.

## Database Queries

### Message Trends
- Menggunakan `DATE_FORMAT` untuk grouping berdasarkan periode
- Menggunakan `SUM` untuk agregasi data
- Data yang kosong akan diisi dengan nilai 0

### Message Type Performance
- Menganalisis `messageTemplate` untuk kategorisasi
- Menghitung persentase success/failed rate
- Mengembalikan data dalam format yang siap untuk chart

## Frontend Integration

Data dari endpoint ini digunakan oleh:
- `wa-flow-manager/src/services/campaign.ts` - service layer
- `wa-flow-manager/src/pages/Dashboard.tsx` - komponen dashboard

Chart yang menggunakan data ini:
- **Message Delivery Trends**: Area chart dengan data time series
- **Message Type Performance**: Bar chart dengan persentase success/failed rate