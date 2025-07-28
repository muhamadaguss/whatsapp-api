# PostgreSQL Compatibility Fix

## Problem
Endpoint chart menggunakan fungsi `DATE_FORMAT` yang merupakan fungsi MySQL, tetapi database yang digunakan adalah PostgreSQL. Ini menyebabkan error:

```
SequelizeDatabaseError: function date_format(timestamp with time zone, unknown) does not exist
```

## Solution
Mengganti fungsi MySQL dengan fungsi PostgreSQL yang equivalent:

### Before (MySQL)
```javascript
sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), dateFormat)
```

### After (PostgreSQL)
```javascript
sequelize.fn('TO_CHAR', sequelize.col('createdAt'), postgresFormat)
```

## Changes Made

### 1. Date Formatting Functions
| Period | MySQL Format | PostgreSQL Format | Output Example |
|--------|-------------|-------------------|----------------|
| Today | `%H:00` | `HH24":00"` | "00:00", "01:00", "23:00" |
| Weekly | `%a` | `Dy` | "Mon", "Tue", "Sun" |
| Monthly | `Day %d` | `"Day "DD` | "Day 01", "Day 15", "Day 31" |

### 2. Ordering Functions
| Period | MySQL | PostgreSQL |
|--------|-------|------------|
| Today | `DATE_FORMAT(createdAt, '%H:00')` | `EXTRACT(HOUR FROM "createdAt")` |
| Weekly | `DATE_FORMAT(createdAt, '%a')` | `EXTRACT(DOW FROM "createdAt")` |
| Monthly | `DATE_FORMAT(createdAt, 'Day %d')` | `EXTRACT(DAY FROM "createdAt")` |

### 3. Code Changes

#### Controller Function
```javascript
// Old MySQL version
const dateFormat = period === 'today' ? '%H:00' : 
                  period === 'weekly' ? '%a' : 'Day %d';

const trends = await Blast.findAll({
  attributes: [
    [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), dateFormat), 'name'],
    // ...
  ],
  group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), dateFormat)],
  order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), dateFormat), 'ASC']]
});
```

```javascript
// New PostgreSQL version
let groupByExpression, orderByExpression;

switch (period) {
  case 'today':
    groupByExpression = sequelize.fn('TO_CHAR', sequelize.col('createdAt'), 'HH24":00"');
    orderByExpression = sequelize.fn('EXTRACT', sequelize.literal('HOUR FROM "createdAt"'));
    break;
  case 'weekly':
    groupByExpression = sequelize.fn('TO_CHAR', sequelize.col('createdAt'), 'Dy');
    orderByExpression = sequelize.fn('EXTRACT', sequelize.literal('DOW FROM "createdAt"'));
    break;
  case 'monthly':
    groupByExpression = sequelize.fn('TO_CHAR', sequelize.col('createdAt'), '"Day "DD');
    orderByExpression = sequelize.fn('EXTRACT', sequelize.literal('DAY FROM "createdAt"'));
    break;
}

const trends = await Blast.findAll({
  attributes: [
    [groupByExpression, 'name'],
    // ...
  ],
  group: [groupByExpression],
  order: [[orderByExpression, 'ASC']]
});
```

### 4. Data Filling Logic
Updated to match PostgreSQL output format:

```javascript
// Today: pad hours with leading zero
const hourLabel = `${i.toString().padStart(2, '0')}:00`;

// Monthly: pad days with leading zero  
const dayLabel = `Day ${i.toString().padStart(2, '0')}`;
```

## Testing

### Updated Test Script
File `test-chart-endpoints.js` telah diupdate untuk:
- Test semua periode (today, weekly, monthly)
- Support testing endpoint individual
- Better error handling

### Usage
```bash
# Test all endpoints for all periods
node test-chart-endpoints.js

# Test single endpoint for specific period
node test-chart-endpoints.js single getMessageTrends today
node test-chart-endpoints.js single getMessageTypePerformance weekly
```

## PostgreSQL Functions Used

### TO_CHAR()
Format tanggal menjadi string dengan pattern tertentu:
- `HH24`: Hour (00-23)
- `Dy`: Abbreviated day name (Mon, Tue, etc.)
- `DD`: Day of month (01-31)
- `"text"`: Literal text dalam output

### EXTRACT()
Ekstrak komponen tertentu dari timestamp:
- `HOUR`: Hour (0-23)
- `DOW`: Day of week (0=Sunday, 1=Monday, etc.)
- `DAY`: Day of month (1-31)

## Verification

Setelah fix ini, endpoint akan:
1. ✅ Berjalan tanpa error di PostgreSQL
2. ✅ Menghasilkan data dengan format yang konsisten
3. ✅ Mendukung semua periode (today, weekly, monthly)
4. ✅ Mengisi data kosong dengan nilai 0
5. ✅ Mengurutkan data dengan benar

## Future Considerations

Untuk mendukung multiple database (MySQL & PostgreSQL), bisa menggunakan:
1. Database dialect detection
2. Conditional query building
3. Sequelize dialect-specific functions

Contoh:
```javascript
const isPostgreSQL = sequelize.getDialect() === 'postgres';
const dateFunction = isPostgreSQL ? 'TO_CHAR' : 'DATE_FORMAT';
const dateFormat = isPostgreSQL ? 'HH24":00"' : '%H:00';
```