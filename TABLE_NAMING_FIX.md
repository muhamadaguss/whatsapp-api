# 🗃️ Table Naming Convention Fix

## 🚨 **Masalah yang Dilaporkan**
```
"Kenapa table nya jadi berubah semua ya awalnya kan saya buat table dengan konotasi majemuk seperti users kenapa di ubah menjadi user"
```

## 🔍 **Root Cause Analysis**

### **Sequelize Configuration Issue**
**File:** `models/db.js`
```javascript
// Problematic configuration
define: {
  timestamps: true,
  underscored: false,
  freezeTableName: true, // ❌ This caused the issue
}
```

### **Impact:**
- `freezeTableName: true` membuat Sequelize menggunakan nama model persis (`User`) sebagai nama table
- Seharusnya menggunakan konvensi plural (`users`) untuk table names
- Model `User` → Table `User` (singular) ❌
- Seharusnya: Model `User` → Table `users` (plural) ✅

## ✅ **Solusi yang Diterapkan**

### **1. Database Configuration Fix**
**File:** `models/db.js`
```javascript
// Fixed configuration
define: {
  timestamps: true,
  underscored: false,
  freezeTableName: false, // ✅ Allow pluralization
}
```

### **2. Explicit Table Names in Models**
Menambahkan `tableName` eksplisit di setiap model untuk konsistensi:

**User Model:**
```javascript
const User = sequelize.define('User', {
  // ... fields
}, { 
  timestamps: true,
  tableName: 'users' // ✅ Explicit plural name
})
```

### **3. Complete Model Updates**

| Model | Table Name | Status |
|-------|------------|--------|
| User | users | ✅ Fixed |
| Session | sessions | ✅ Fixed |
| Blast | blasts | ✅ Fixed |
| MessageStatus | message_statuses | ✅ Fixed |
| BlacklistedToken | blacklisted_tokens | ✅ Fixed |
| ChatMessage | chat_messages | ✅ Fixed |
| MenuItem | menu_items | ✅ Fixed |
| Template | templates | ✅ Fixed |

## 🔄 **Migration Process**

### **1. Table Rename Migration**
**Script:** `migrate-table-names.js`
```bash
node migrate-table-names.js
```

**Process:**
```sql
-- Example migrations performed
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "Session" RENAME TO "sessions";
ALTER TABLE "Blast" RENAME TO "blasts";
-- ... etc for all tables
```

### **2. Enum Type Updates**
```sql
-- Updated enum types to match new table names
ALTER TYPE "enum_User_role" RENAME TO "enum_users_role";
```

### **3. Cleanup Old Tables**
**Script:** `cleanup-old-tables.js`
```bash
node cleanup-old-tables.js
```

**Removed duplicate tables:**
- `Users` (auto-created by Sequelize)
- `Sessions`, `Blasts`, etc.

## 📊 **Before vs After**

### **Before (Problematic):**
```
Database Tables:
├── User (singular) ❌
├── Session (singular) ❌
├── Blast (singular) ❌
└── ... (all singular)

Plus duplicate auto-created:
├── Users (plural, unused)
├── Sessions (plural, unused)
└── ... (duplicates)
```

### **After (Fixed):**
```
Database Tables:
├── users (plural) ✅
├── sessions (plural) ✅
├── blasts (plural) ✅
├── message_statuses (plural) ✅
├── blacklisted_tokens (plural) ✅
├── chat_messages (plural) ✅
├── menu_items (plural) ✅
└── templates (plural) ✅
```

## 🧪 **Testing & Validation**

### **1. Data Integrity Check**
```bash
node check-users.js
```
**Result:**
```
✅ All user data preserved
✅ 5 users found in 'users' table
✅ Passwords still working
```

### **2. Application Functionality**
```bash
node quick-test-login.js
```
**Result:**
```
✅ Login API working with new table names
✅ JWT generation successful
✅ Database queries using 'users' table
```

### **3. Query Examples**
**Before:**
```sql
SELECT * FROM "User" WHERE username = 'admin';
```

**After:**
```sql
SELECT * FROM "users" WHERE username = 'admin';
```

## 🔒 **Database Schema Consistency**

### **Naming Convention Applied:**
- ✅ **Tables:** Plural, snake_case (`users`, `message_statuses`)
- ✅ **Columns:** camelCase (`userId`, `createdAt`)
- ✅ **Enums:** Prefixed with table name (`enum_users_role`)
- ✅ **Indexes:** Auto-generated with proper naming

### **Foreign Key Relationships:**
```sql
-- All relationships preserved
users.id → sessions.userId
users.id → blasts.userId
users.id → templates.userId
```

## 🚀 **Production Impact**

### **Zero Downtime Migration:**
1. ✅ Data preserved during table rename
2. ✅ Application continues working
3. ✅ No data loss
4. ✅ All relationships maintained

### **Performance Benefits:**
- ✅ Eliminated duplicate tables
- ✅ Cleaner database schema
- ✅ Standard naming convention
- ✅ Better maintainability

## 📝 **Files Modified**

### **Model Files Updated:**
- `models/userModel.js` - Added `tableName: 'users'`
- `models/sessionModel.js` - Added `tableName: 'sessions'`
- `models/blastModel.js` - Added `tableName: 'blasts'`
- `models/messageStatusModel.js` - Added `tableName: 'message_statuses'`
- `models/blacklistedTokenModel.js` - Added `tableName: 'blacklisted_tokens'`
- `models/chatModel.js` - Added `tableName: 'chat_messages'`
- `models/menuModel.js` - Added `tableName: 'menu_items'`
- `models/templateModel.js` - Added `tableName: 'templates'`

### **Configuration Files:**
- `models/db.js` - Updated `freezeTableName: false`

### **Utility Scripts Created:**
- `migrate-table-names.js` - Rename tables to plural
- `cleanup-old-tables.js` - Remove duplicate tables
- `check-users.js` - Validate data integrity

## 🎯 **Best Practices Implemented**

### **1. Consistent Naming:**
```javascript
// Model definition with explicit table name
const User = sequelize.define('User', {
  // fields...
}, {
  tableName: 'users', // ✅ Always specify
  timestamps: true
});
```

### **2. Migration Safety:**
```javascript
// Safe table rename with checks
if (existingTables.includes(oldName) && !existingTables.includes(newName)) {
  await sequelize.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}";`);
}
```

### **3. Data Validation:**
```javascript
// Always verify data after migration
const userCount = await User.count();
console.log(`✅ ${userCount} users preserved`);
```

## 🔄 **Future Maintenance**

### **For New Models:**
```javascript
// Template for new models
const NewModel = sequelize.define('NewModel', {
  // fields...
}, {
  tableName: 'new_models', // ✅ Always plural, snake_case
  timestamps: true
});
```

### **Migration Commands:**
```bash
# Check current tables
node -e "require('./models/db').query('SELECT table_name FROM information_schema.tables WHERE table_schema = \\'public\\';').then(([results]) => console.log(results.map(r => r.table_name)))"

# Validate data integrity
node check-users.js

# Test application
node quick-test-login.js
```

---
**Status:** ✅ **RESOLVED**  
**Date:** 2025-07-25  
**Impact:** Database schema now follows proper naming conventions  
**Data Loss:** None - all data preserved during migration