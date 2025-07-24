# Centralized Error Handling

## Overview
Aplikasi ini menggunakan centralized error handling middleware untuk menangani semua error secara konsisten dan terpusat.

## Components

### 1. Error Handler Middleware (`middleware/errorHandler.js`)
- **errorHandler**: Main error handling middleware
- **asyncHandler**: Wrapper untuk async functions
- **notFound**: 404 handler
- **AppError**: Custom error class

### 2. Usage Examples

#### Before (Manual Error Handling)
```javascript
const getUsers = async (req, res) => {
  try {
    const users = await UserModel.findAll();
    res.json(users);
  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(500).json({ message: 'Failed to get users', error });
  }
}
```

#### After (Centralized Error Handling)
```javascript
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const getUsers = asyncHandler(async (req, res) => {
  const users = await UserModel.findAll();
  res.json(users);
});

// Untuk custom errors
const getUserById = asyncHandler(async (req, res) => {
  const user = await UserModel.findByPk(req.params.id);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  res.json(user);
});
```

## Error Types Handled

### 1. Boom Errors
```javascript
if (Boom.isBoom(err)) {
  return res.status(err.output.statusCode).json({
    status: 'error',
    message: err.output.payload.message
  });
}
```

### 2. Sequelize Errors
- **SequelizeValidationError**: Validation errors
- **SequelizeUniqueConstraintError**: Duplicate entries

### 3. JWT Errors
- **JsonWebTokenError**: Invalid token
- **TokenExpiredError**: Expired token

### 4. Multer Errors
- **LIMIT_FILE_SIZE**: File too large

### 5. Custom AppError
```javascript
throw new AppError('Custom error message', 400);
```

## Benefits

1. **Consistency**: Semua error memiliki format response yang sama
2. **Cleaner Code**: Controller lebih bersih tanpa try-catch berulang
3. **Better Logging**: Centralized logging dengan context information
4. **Development Mode**: Stack trace hanya muncul di development
5. **Automatic Handling**: Async errors otomatis tertangkap

## Response Format

```json
{
  "status": "error",
  "message": "Error description",
  "stack": "Stack trace (development only)"
}
```

## Migration Guide

1. Import `asyncHandler` dan `AppError`
2. Wrap async functions dengan `asyncHandler`
3. Replace manual error responses dengan `throw new AppError()`
4. Remove try-catch blocks
5. Let middleware handle the errors

## Example Migration

```javascript
// OLD
const createUser = async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username required' });
    }
    
    const user = await UserModel.create({ username });
    res.status(201).json(user);
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
}

// NEW
const createUser = asyncHandler(async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    throw new AppError('Username required', 400);
  }
  
  const user = await UserModel.create({ username });
  res.status(201).json(user);
});
```