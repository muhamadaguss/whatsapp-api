# SQL Fix Documentation - getMessageTrends API

## Problem

Error terjadi pada endpoint `POST /campaign/getMessageTrends` dengan error PostgreSQL:

```
SequelizeDatabaseError: column must appear in the GROUP BY clause or be used in an aggregate function
Error code: 42803
```

## Root Cause

Query SQL yang dihasilkan memiliki masalah pada GROUP BY clause. Pada ORDER BY menggunakan expression `EXTRACT(DAY FROM "createdAt")` tetapi expression ini tidak dimasukkan ke dalam GROUP BY clause.

### Query Bermasalah (Sebelum Fix)

```sql
SELECT TO_CHAR("createdAt", '"Day "DD') AS "name",
       SUM("sentCount") AS "success",
       SUM("failedCount") AS "failed",
       SUM("totalRecipients") AS "total"
FROM "blasts" AS "Blast"
WHERE "Blast"."userId" = 1
  AND "Blast"."createdAt" BETWEEN '2025-08-01 00:00:00.000 +00:00' AND '2025-08-31 23:59:59.999 +00:00'
GROUP BY TO_CHAR("createdAt", '"Day "DD')
ORDER BY EXTRACT(DAY FROM "createdAt") ASC;
```

**Masalah**: `EXTRACT(DAY FROM "createdAt")` di ORDER BY tidak ada di GROUP BY clause.

## Solution

Menambahkan `orderByExpression` ke dalam GROUP BY clause di file `controllers/campaignController.js`.

### Code Fix

**File**: `whatsapp/controllers/campaignController.js`
**Line**: ~169-170

**Before**:

```javascript
group: [groupByExpression],
order: [[orderByExpression, "ASC"]],
```

**After**:

```javascript
group: [groupByExpression, orderByExpression],
order: [[orderByExpression, "ASC"]],
```

### Query Setelah Fix

```sql
SELECT TO_CHAR("createdAt", '"Day "DD') AS "name",
       SUM("sentCount") AS "success",
       SUM("failedCount") AS "failed",
       SUM("totalRecipients") AS "total"
FROM "blasts" AS "Blast"
WHERE "Blast"."userId" = 1
  AND "Blast"."createdAt" BETWEEN '2025-08-01 00:00:00.000 +00:00' AND '2025-08-31 23:59:59.999 +00:00'
GROUP BY TO_CHAR("createdAt", '"Day "DD'), EXTRACT(DAY FROM "createdAt")
ORDER BY EXTRACT(DAY FROM "createdAt") ASC;
```

## Impact

Fix ini berlaku untuk semua period di endpoint getMessageTrends:

- **today**: GROUP BY includes `TO_CHAR("createdAt", 'HH24":00"')` dan `EXTRACT(HOUR FROM "createdAt")`
- **weekly**: GROUP BY includes `TO_CHAR("createdAt", 'Dy')` dan `EXTRACT(DOW FROM "createdAt")`
- **monthly**: GROUP BY includes `TO_CHAR("createdAt", '"Day "DD')` dan `EXTRACT(DAY FROM "createdAt")`

## Testing

Untuk menguji perbaikan:

```bash
# Test query generation (tanpa database)
node test-query-generation.js

# Test dengan database aktif
node test-sql-fix.js

# Test endpoint langsung
node test-chart-endpoints.js single getMessageTrends monthly
```

## Status

✅ **FIXED** - Error PostgreSQL 42803 sudah teratasi dengan menambahkan orderByExpression ke GROUP BY clause.
