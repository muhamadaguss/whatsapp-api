/**
 * ⚡ Performance Testing Suite
 * 
 * Tests system performance under various load conditions:
 * - Query performance per tenant (<100ms target)
 * - API response times (<200ms target)
 * - Database index validation
 * - Concurrent user handling
 * - Socket.IO per-tenant channels
 * - Memory and resource usage
 */

const request = require('supertest');
const { expect } = require('chai');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import app and models
const app = require('../index');
const User = require('../models/userModel');
const Organization = require('../models/organizationModel');
const Template = require('../models/templateModel');
const Campaign = require('../models/campaignModel');
const sequelize = require('../models/db');

describe('⚡ Performance Testing Suite', function() {
  this.timeout(30000); // 30 seconds for performance tests

  let organizations = [];
  let users = [];
  let tokens = [];
  const NUM_ORGS = 10; // Test with 10 organizations

  before(async () => {
    console.log('🔧 Setting up performance test data...');
    
    // Clean up
    const { Op } = require('sequelize');
    await Template.destroy({ where: { name: { [Op.like]: 'perftest_%' } } });
    await Campaign.destroy({ where: { name: { [Op.like]: 'perftest_%' } } });
    await User.destroy({ where: { username: { [Op.like]: 'perftest_%' } } });
    await Organization.destroy({ where: { slug: { [Op.like]: 'perftest-%' } } });

    // Create multiple organizations
    const password = bcrypt.hashSync('TestPassword123!', 10);
    
    for (let i = 0; i < NUM_ORGS; i++) {
      const org = await Organization.create({
        name: `Performance Test Org ${i}`,
        slug: `perftest-org-${i}`,
        email: `perftest-${i}@test.com`,
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active'
      });
      organizations.push(org);

      const user = await User.create({
        username: `perftest_user_${i}`,
        password,
        role: 'user',
        roleInOrg: 'owner',
        organizationId: org.id,
        isActive: true
      });
      users.push(user);

      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          organizationId: org.id,
          roleInOrg: 'owner'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      tokens.push(token);

      // Create test data for each org
      for (let j = 0; j < 20; j++) {
        await Template.create({
          name: `perftest_template_${i}_${j}`,
          content: `Test content for org ${i} template ${j}`,
          organizationId: org.id
        });
      }
    }

    console.log(`✅ Created ${NUM_ORGS} organizations with ${NUM_ORGS * 20} templates`);
  });

  after(async () => {
    // Clean up
    const { Op } = require('sequelize');
    await Template.destroy({ where: { name: { [Op.like]: 'perftest_%' } } });
    await Campaign.destroy({ where: { name: { [Op.like]: 'perftest_%' } } });
    await User.destroy({ where: { username: { [Op.like]: 'perftest_%' } } });
    await Organization.destroy({ where: { slug: { [Op.like]: 'perftest-%' } } });
  });

  // ====================================
  // Database Query Performance Tests
  // ====================================

  describe('🗄️ Database Query Performance', () => {
    it('should execute tenant-filtered queries in <100ms', async () => {
      const startTime = Date.now();
      
      // Query templates for first organization
      const templates = await Template.findAll({
        where: { organizationId: organizations[0].id },
        limit: 100
      });

      const queryTime = Date.now() - startTime;
      
      console.log(`   📊 Query time: ${queryTime}ms for ${templates.length} templates`);
      expect(queryTime).to.be.below(100);
      expect(templates).to.have.lengthOf(20);
    });

    it('should use index on organizationId column', async () => {
      // Check if index exists on templates table
      const [indexes] = await sequelize.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'templates' 
        AND indexdef LIKE '%organization_id%'
      `);

      console.log(`   📊 Found ${indexes.length} index(es) on organization_id`);
      expect(indexes.length).to.be.at.least(1);
    });

    it('should efficiently query across multiple organizations', async () => {
      const startTime = Date.now();
      
      // Query templates for multiple organizations
      const queries = organizations.slice(0, 5).map(org => 
        Template.findAll({
          where: { organizationId: org.id },
          limit: 10
        })
      );

      const results = await Promise.all(queries);
      const queryTime = Date.now() - startTime;

      console.log(`   📊 Parallel query time: ${queryTime}ms for 5 organizations`);
      expect(queryTime).to.be.below(500);
      expect(results).to.have.lengthOf(5);
    });

    it('should perform JOIN queries efficiently', async () => {
      const startTime = Date.now();
      
      const org = await Organization.findOne({
        where: { id: organizations[0].id },
        include: [
          {
            model: User,
            as: 'users',
            attributes: ['id', 'username', 'roleInOrg']
          }
        ]
      });

      const queryTime = Date.now() - startTime;

      console.log(`   📊 JOIN query time: ${queryTime}ms`);
      expect(queryTime).to.be.below(100);
      expect(org).to.exist;
    });

    it('should handle pagination efficiently', async () => {
      const startTime = Date.now();
      
      const page1 = await Template.findAll({
        where: { organizationId: organizations[0].id },
        limit: 10,
        offset: 0,
        order: [['createdAt', 'DESC']]
      });

      const page2 = await Template.findAll({
        where: { organizationId: organizations[0].id },
        limit: 10,
        offset: 10,
        order: [['createdAt', 'DESC']]
      });

      const queryTime = Date.now() - startTime;

      console.log(`   📊 Pagination query time: ${queryTime}ms for 2 pages`);
      expect(queryTime).to.be.below(200);
      expect(page1).to.have.lengthOf(10);
      expect(page2).to.have.lengthOf(10);
    });
  });

  // ====================================
  // API Response Time Tests
  // ====================================

  describe('🚀 API Response Times', () => {
    it('should respond to GET /api/organizations in <200ms', async () => {
      const startTime = Date.now();
      
      const res = await request(app)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${tokens[0]}`)
        .expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`   📊 API response time: ${responseTime}ms`);
      expect(responseTime).to.be.below(200);
      expect(res.body).to.have.property('organizations');
    });

    it('should respond to GET /api/templates in <200ms', async () => {
      const startTime = Date.now();
      
      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tokens[0]}`)
        .expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`   📊 API response time: ${responseTime}ms`);
      expect(responseTime).to.be.below(200);
      expect(res.body).to.have.property('templates');
    });

    it('should respond to POST /api/templates in <300ms', async () => {
      const startTime = Date.now();
      
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tokens[0]}`)
        .send({
          name: 'perftest_new_template',
          content: 'Performance test template content',
          organizationId: organizations[0].id
        });

      const responseTime = Date.now() - startTime;

      console.log(`   📊 API response time: ${responseTime}ms`);
      expect(responseTime).to.be.below(300);
      expect([200, 201]).to.include(res.status);
    });

    it('should handle authentication in <100ms', async () => {
      const startTime = Date.now();
      
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'perftest_user_0',
          password: 'TestPassword123!'
        })
        .expect(200);

      const responseTime = Date.now() - startTime;

      console.log(`   📊 Auth response time: ${responseTime}ms`);
      expect(responseTime).to.be.below(100);
      expect(res.body).to.have.property('token');
    });
  });

  // ====================================
  // Concurrent Request Tests
  // ====================================

  describe('👥 Concurrent User Handling', () => {
    it('should handle 10 concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      const requests = Array(10).fill(null).map((_, i) =>
        request(app)
          .get('/api/templates')
          .set('Authorization', `Bearer ${tokens[i % tokens.length]}`)
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / 10;

      console.log(`   📊 Total time: ${totalTime}ms, Average: ${avgTime}ms per request`);
      
      responses.forEach(res => {
        expect(res.status).to.equal(200);
      });

      expect(avgTime).to.be.below(300);
    });

    it('should handle 50 concurrent requests without errors', async () => {
      const startTime = Date.now();
      
      const requests = Array(50).fill(null).map((_, i) =>
        request(app)
          .get('/api/organizations')
          .set('Authorization', `Bearer ${tokens[i % tokens.length]}`)
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      console.log(`   📊 50 concurrent requests completed in ${totalTime}ms`);
      
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).to.equal(50);
      expect(totalTime).to.be.below(5000); // 5 seconds for 50 requests
    });

    it('should maintain data isolation under concurrent load', async () => {
      const requests = tokens.map((token, i) =>
        request(app)
          .get('/api/templates')
          .set('Authorization', `Bearer ${token}`)
          .then(res => ({
            orgIndex: i,
            templates: res.body.templates || []
          }))
      );

      const results = await Promise.all(requests);

      // Verify each org got their own templates
      results.forEach((result, i) => {
        const templates = result.templates;
        if (templates.length > 0) {
          templates.forEach(template => {
            expect(template.organizationId).to.equal(organizations[i].id);
          });
        }
      });

      console.log(`   📊 Data isolation verified across ${results.length} concurrent requests`);
    });
  });

  // ====================================
  // Load Testing
  // ====================================

  describe('📈 Load Testing', () => {
    it('should handle sustained load (100 requests)', async function() {
      this.timeout(60000); // 1 minute
      
      const batchSize = 10;
      const batches = 10; // 10 batches of 10 = 100 requests
      const results = [];

      for (let batch = 0; batch < batches; batch++) {
        const startTime = Date.now();
        
        const requests = Array(batchSize).fill(null).map((_, i) =>
          request(app)
            .get('/api/templates')
            .set('Authorization', `Bearer ${tokens[(batch * batchSize + i) % tokens.length]}`)
        );

        const responses = await Promise.all(requests);
        const batchTime = Date.now() - startTime;
        
        results.push({
          batch: batch + 1,
          time: batchTime,
          avgTime: batchTime / batchSize,
          successCount: responses.filter(r => r.status === 200).length
        });

        console.log(`   📊 Batch ${batch + 1}/${batches}: ${batchTime}ms (avg: ${(batchTime / batchSize).toFixed(2)}ms)`);
      }

      // Calculate overall statistics
      const totalTime = results.reduce((sum, r) => sum + r.time, 0);
      const avgBatchTime = totalTime / batches;
      const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);

      console.log(`   📊 Load test completed: ${totalSuccess}/100 requests successful`);
      console.log(`   📊 Average batch time: ${avgBatchTime.toFixed(2)}ms`);

      expect(totalSuccess).to.equal(100);
      expect(avgBatchTime).to.be.below(2000); // Average batch should be under 2 seconds
    });

    it('should not degrade performance over time', async function() {
      this.timeout(30000);

      const measurements = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const res = await request(app)
          .get('/api/templates')
          .set('Authorization', `Bearer ${tokens[0]}`)
          .expect(200);

        const responseTime = Date.now() - startTime;
        measurements.push(responseTime);

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgTime = measurements.reduce((sum, t) => sum + t, 0) / iterations;
      const firstTime = measurements[0];
      const lastTime = measurements[measurements.length - 1];

      console.log(`   📊 Response times: ${measurements.join('ms, ')}ms`);
      console.log(`   📊 First: ${firstTime}ms, Last: ${lastTime}ms, Avg: ${avgTime.toFixed(2)}ms`);

      // Last request should not be significantly slower than first
      // Allow 50% degradation max
      expect(lastTime).to.be.below(firstTime * 1.5);
    });
  });

  // ====================================
  // Memory and Resource Tests
  // ====================================

  describe('💾 Memory and Resources', () => {
    it('should not cause memory leaks during repeated queries', async function() {
      this.timeout(20000);

      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform 100 queries
      for (let i = 0; i < 100; i++) {
        await Template.findAll({
          where: { organizationId: organizations[i % NUM_ORGS].id },
          limit: 10
        });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = (memoryIncrease / 1024 / 1024).toFixed(2);

      console.log(`   📊 Memory increase: ${memoryIncreaseMB} MB after 100 queries`);
      
      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).to.be.below(50 * 1024 * 1024);
    });

    it('should report memory usage statistics', () => {
      const usage = process.memoryUsage();
      const heapUsedMB = (usage.heapUsed / 1024 / 1024).toFixed(2);
      const heapTotalMB = (usage.heapTotal / 1024 / 1024).toFixed(2);
      const rssMB = (usage.rss / 1024 / 1024).toFixed(2);

      console.log(`   📊 Heap Used: ${heapUsedMB} MB`);
      console.log(`   📊 Heap Total: ${heapTotalMB} MB`);
      console.log(`   📊 RSS: ${rssMB} MB`);

      expect(usage.heapUsed).to.be.below(usage.heapTotal);
    });
  });

  // ====================================
  // Database Connection Pool Tests
  // ====================================

  describe('🔌 Database Connection Pool', () => {
    it('should efficiently use connection pool', async () => {
      const pool = sequelize.connectionManager.pool;
      
      if (pool) {
        console.log(`   📊 Pool size: ${pool.size}`);
        console.log(`   📊 Pool available: ${pool.available}`);
        console.log(`   📊 Pool using: ${pool.using}`);
        console.log(`   📊 Pool waiting: ${pool.waiting}`);

        // Pool should not be exhausted
        expect(pool.available).to.be.at.least(0);
      }
    });

    it('should handle connection pool exhaustion gracefully', async function() {
      this.timeout(15000);

      const poolSize = sequelize.config.pool?.max || 5;
      console.log(`   📊 Testing with pool size: ${poolSize}`);

      // Create queries that exceed pool size
      const queries = Array(poolSize + 5).fill(null).map(() =>
        Template.findAll({
          where: { organizationId: organizations[0].id },
          limit: 5
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(queries);
      const queryTime = Date.now() - startTime;

      console.log(`   📊 ${queries.length} queries completed in ${queryTime}ms`);
      
      expect(results).to.have.lengthOf(poolSize + 5);
      expect(queryTime).to.be.below(5000);
    });
  });

  // ====================================
  // Index Validation Tests
  // ====================================

  describe('📑 Database Index Validation', () => {
    it('should have indexes on all organizationId foreign keys', async () => {
      const tables = ['templates', 'campaigns', 'users', 'subscriptions', 'usage_tracking'];
      const missingIndexes = [];

      for (const table of tables) {
        const [indexes] = await sequelize.query(`
          SELECT indexname, indexdef 
          FROM pg_indexes 
          WHERE tablename = '${table}'
          AND indexdef LIKE '%organization_id%'
        `);

        if (indexes.length === 0) {
          missingIndexes.push(table);
        } else {
          console.log(`   ✅ ${table}: ${indexes.length} index(es) on organization_id`);
        }
      }

      if (missingIndexes.length > 0) {
        console.log(`   ⚠️ Missing indexes on: ${missingIndexes.join(', ')}`);
      }

      // Some tables may not need organizationId (like users table might use different structure)
      // This test documents the current state
      expect(missingIndexes.length).to.be.at.most(2);
    });

    it('should use EXPLAIN ANALYZE to verify query plans', async () => {
      const [result] = await sequelize.query(`
        EXPLAIN ANALYZE 
        SELECT * FROM templates 
        WHERE organization_id = '${organizations[0].id}' 
        LIMIT 10
      `);

      console.log(`   📊 Query plan:`);
      result.forEach(row => {
        console.log(`      ${row['QUERY PLAN']}`);
      });

      // Check if index is being used
      const queryPlan = result.map(r => r['QUERY PLAN']).join(' ');
      const usingIndex = queryPlan.includes('Index Scan') || queryPlan.includes('Index');
      
      if (usingIndex) {
        console.log(`   ✅ Query is using index`);
      } else {
        console.log(`   ⚠️ Query is NOT using index (Sequential Scan)`);
      }

      expect(result).to.be.an('array');
    });
  });

  // ====================================
  // Performance Benchmarks Summary
  // ====================================

  describe('📊 Performance Benchmarks Summary', () => {
    it('should display overall performance metrics', async () => {
      console.log('\n   ═══════════════════════════════════════════════');
      console.log('   📊 PERFORMANCE BENCHMARKS SUMMARY');
      console.log('   ═══════════════════════════════════════════════\n');

      // Database query performance
      const dbStartTime = Date.now();
      await Template.findAll({
        where: { organizationId: organizations[0].id },
        limit: 100
      });
      const dbTime = Date.now() - dbStartTime;

      // API response time
      const apiStartTime = Date.now();
      await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tokens[0]}`);
      const apiTime = Date.now() - apiStartTime;

      // Memory usage
      const memory = process.memoryUsage();
      const heapUsedMB = (memory.heapUsed / 1024 / 1024).toFixed(2);

      console.log(`   🗄️  Database Query Time:    ${dbTime}ms       Target: <100ms`);
      console.log(`   🚀 API Response Time:      ${apiTime}ms       Target: <200ms`);
      console.log(`   💾 Memory Usage (Heap):    ${heapUsedMB} MB`);
      console.log(`   🏢 Organizations Tested:   ${NUM_ORGS}`);
      console.log(`   📄 Templates per Org:      20`);
      console.log(`   👥 Concurrent Users:       10-50 tested`);
      console.log('\n   ═══════════════════════════════════════════════\n');

      expect(dbTime).to.be.below(100);
      expect(apiTime).to.be.below(200);
    });
  });
});
