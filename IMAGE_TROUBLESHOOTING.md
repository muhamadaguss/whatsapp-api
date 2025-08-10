# Image Feature Troubleshooting Guide

## Quick Diagnosis

Run these commands to diagnose issues:

```bash
# Test all image components
node test-image-feature.js

# Test database connection and schema
node simple-migration.js

# Start server with diagnostics
node start-with-image-support.js
```

## Common Issues and Solutions

### 1. "Failed to download image" Error

**Symptoms:**

- Error in logs: `❌ Failed to download image:`
- Images show as "Image not available" in chat

**Causes & Solutions:**

#### A. Baileys Version Issue

```bash
# Check current version
npm list @whiskeysockets/baileys

# Update to latest
npm update @whiskeysockets/baileys

# Or install specific working version
npm install @whiskeysockets/baileys@6.7.16
```

#### B. WhatsApp Session Not Fully Connected

- Ensure QR code is scanned and session is active
- Check session logs for connection issues
- Try reconnecting the session

#### C. Missing downloadMediaMessage Function

- Some Baileys versions don't have this function
- Check logs for "downloadMediaMessage function not available"
- Update Baileys or use alternative approach

### 2. Database Connection Issues

**Symptoms:**

- `password authentication failed`
- `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`

**Solutions:**

#### A. Check PostgreSQL Status

```bash
# On macOS with Homebrew
brew services list | grep postgresql
brew services start postgresql

# On Linux
sudo systemctl status postgresql
sudo systemctl start postgresql
```

#### B. Verify Database Credentials

Check `.env` file:

```env
DB_NAME=whatsapp_blast
DB_USER=postgres
DB_PASS=your_password
DB_HOST=localhost
DB_PORT=5432
```

#### C. Create Database and User

```sql
-- Connect as postgres superuser
psql -U postgres

-- Create database
CREATE DATABASE whatsapp_blast;

-- Create user (if needed)
CREATE USER your_user WITH PASSWORD 'your_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE whatsapp_blast TO your_user;
```

### 3. Missing Database Columns

**Symptoms:**

- Images send but don't appear in chat
- Database errors about missing columns

**Solution:**

```bash
# Run migration
node simple-migration.js
```

Or manually in PostgreSQL:

```sql
ALTER TABLE chat_messages ADD COLUMN "messageType" VARCHAR(255) DEFAULT 'text' NOT NULL;
ALTER TABLE chat_messages ADD COLUMN "mediaUrl" TEXT;
```

### 4. File Upload Issues

**Symptoms:**

- Cannot send images from frontend
- Upload errors

**Solutions:**

#### A. Check Folder Permissions

```bash
chmod 755 whatsapp/uploads
chown -R $USER:$USER whatsapp/uploads
```

#### B. Check Disk Space

```bash
df -h
```

#### C. Verify Multer Configuration

Ensure file size limits and MIME types are correct.

### 5. Images Not Displaying in Frontend

**Symptoms:**

- Images send successfully but don't show in chat
- 404 errors for image URLs

**Solutions:**

#### A. Verify Static File Serving

Check that this line is in `index.js`:

```javascript
app.use("/uploads", express.static("uploads"));
```

#### B. Check Image URLs

Images should be accessible at:

```
http://localhost:3000/uploads/image_filename.jpg
```

#### C. Check Browser Console

Look for 404 or CORS errors when loading images.

## Testing Steps

### 1. Component Test

```bash
node test-image-feature.js
```

Should show all ✅ for basic components.

### 2. Database Test

```bash
node simple-migration.js
```

Should connect and show table structure.

### 3. Server Test

```bash
node start-with-image-support.js
```

Should start server with diagnostics.

### 4. Manual Image Test

1. Start the server
2. Connect WhatsApp session
3. Send an image to the bot
4. Check logs for download attempts
5. Check if file appears in `uploads/` folder
6. Verify image shows in frontend chat

## Fallback Behavior

When image download fails:

- Message is still saved with `messageType: "image"`
- `mediaUrl` will be `null`
- Frontend shows placeholder: "Image not available"
- Caption text is still displayed
- No error thrown to prevent session crash

## Debug Logs

Enable detailed logging by checking these log messages:

```
📷 Attempting to download image from [phone]
📷 Image saved successfully: [filename] ([size] bytes)
❌ Failed to download image: [error details]
💾 Chat message saved to database from [contact]
```

## Alternative Solutions

If download continues to fail:

1. **Disable Image Download**

   - Comment out download code
   - Just save message type as "image"
   - Show placeholder in frontend

2. **Use External Storage**

   - Implement AWS S3 or Cloudinary
   - Upload images to cloud storage
   - Store cloud URLs in database

3. **WhatsApp Business API**
   - More reliable for production use
   - Better media handling
   - Official support

## Getting Help

If issues persist:

1. Check server logs for detailed error messages
2. Verify all components pass the test scripts
3. Ensure database schema is correct
4. Test with a simple image first
5. Check WhatsApp session connectivity

For database issues, ensure PostgreSQL is properly installed and configured for your system.
