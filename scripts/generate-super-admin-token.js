#!/usr/bin/env node

/**
 * Generate Super Admin Token Script
 * 
 * This script generates a JWT token for a super admin user
 * Usage: node scripts/generate-super-admin-token.js <username>
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');
const sequelize = require('../models/db');

require('dotenv').config();

async function generateSuperAdminToken() {
  try {
    const username = process.argv[2] || 'admin';
    
    console.log('🔍 Finding super admin user:', username);
    
    // Find the user
    const user = await UserModel.findOne({
      where: { username }
    });
    
    if (!user) {
      console.error('❌ User not found:', username);
      console.log('\n💡 Available users:');
      const users = await UserModel.findAll({
        attributes: ['username', 'isSuperAdmin']
      });
      users.forEach(u => {
        console.log(`   - ${u.username} ${u.isSuperAdmin ? '(Super Admin)' : ''}`);
      });
      process.exit(1);
    }
    
    if (!user.isSuperAdmin) {
      console.error('❌ User is not a super admin:', username);
      console.log('\n💡 To make this user a super admin, run:');
      console.log(`   UPDATE users SET "isSuperAdmin" = true WHERE username = '${username}';`);
      process.exit(1);
    }
    
    console.log('✅ Super admin user found:', username);
    console.log('   ID:', user.id);
    console.log('   isSuperAdmin:', user.isSuperAdmin);
    console.log('   organizationId:', user.organizationId || 'NULL (super admin)');
    
    // Generate JWT token
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      organizationId: user.organizationId || null,
      roleInOrg: user.roleInOrg || 'super_admin',
      isSuperAdmin: true,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomBytes(16).toString('hex'),
    };
    
    const tokenOptions = {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      algorithm: 'HS256',
    };
    
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, tokenOptions);
    
    console.log('\n🎉 Super Admin Token Generated Successfully!');
    console.log('\n📋 Token:');
    console.log(token);
    console.log('\n📝 Token Payload:');
    console.log(JSON.stringify(tokenPayload, null, 2));
    console.log('\n⏰ Expires in:', tokenOptions.expiresIn);
    console.log('\n💡 How to use:');
    console.log('   1. Copy the token above');
    console.log('   2. Add to your HTTP requests:');
    console.log('      Authorization: Bearer <token>');
    console.log('\n🧪 Test with curl:');
    console.log(`   curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/organizations`);
    
    await sequelize.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error generating token:', error.message);
    console.error(error);
    process.exit(1);
  }
}

generateSuperAdminToken();
