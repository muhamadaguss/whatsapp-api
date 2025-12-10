const logger = require('./logger');
function validateEnvironment(requiredEnvs = {}, optionalEnvs = {}) {
  const errors = [];
  const warnings = [];
  const config = {};
  Object.entries(requiredEnvs).forEach(([envName, description]) => {
    const value = process.env[envName];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${envName} (${description})`);
    } else {
      config[envName] = value.trim();
    }
  });
  Object.entries(optionalEnvs).forEach(([envName, defaultValue]) => {
    const value = process.env[envName];
    if (!value || value.trim() === '') {
      config[envName] = defaultValue;
      warnings.push(`Using default value for ${envName}: ${defaultValue}`);
    } else {
      config[envName] = value.trim();
    }
  });
  if (warnings.length > 0) {
    warnings.forEach(warning => logger.warn(warning));
  }
  if (errors.length > 0) {
    logger.error('Environment validation failed:');
    errors.forEach(error => logger.error(`  - ${error}`));
    logger.error('\nPlease check your .env file and ensure all required variables are set.');
    logger.error('Example .env file:');
    logger.error('DB_NAME=your_database_name');
    logger.error('DB_USER=your_database_user');
    logger.error('DB_PASS=your_database_password');
    logger.error('DB_HOST=your_database_host');
    logger.error('JWT_SECRET=your_jwt_secret');
    process.exit(1);
  }
  return config;
}
function validateEnvFormats(config) {
  const errors = [];
  if (config.PORT && isNaN(parseInt(config.PORT))) {
    errors.push('PORT must be a valid number');
  }
  if (config.DB_PORT && isNaN(parseInt(config.DB_PORT))) {
    errors.push('DB_PORT must be a valid number');
  }
  if (config.JWT_SECRET) {
    const SecurityUtils = require('./security');
    const jwtValidation = SecurityUtils.validateJWTSecret(config.JWT_SECRET);
    if (!jwtValidation.valid) {
      jwtValidation.issues.forEach(issue => errors.push(`JWT_SECRET: ${issue}`));
    }
    jwtValidation.recommendations.forEach(rec => {
      logger.warn(`JWT_SECRET: ${rec}`);
    });
  }
  if (config.NODE_ENV && !['development', 'production', 'test'].includes(config.NODE_ENV)) {
    errors.push('NODE_ENV must be one of: development, production, test');
  }
  if (errors.length > 0) {
    logger.error('Environment format validation failed:');
    errors.forEach(error => logger.error(`  - ${error}`));
    process.exit(1);
  }
  return config;
}
function validateWhatsAppEnv() {
  logger.info('🔍 Validating environment variables...');
  const requiredEnvs = {
    DB_NAME: 'Database name',
    DB_USER: 'Database username',
    DB_PASS: 'Database password',
    DB_HOST: 'Database host',
    JWT_SECRET: 'JWT secret key for token signing'
  };
  const optionalEnvs = {
    PORT: '3000',
    DB_PORT: '5432',
    NODE_ENV: 'development'
  };
  let config = validateEnvironment(requiredEnvs, optionalEnvs);
  config = validateEnvFormats(config);
  config.PORT = parseInt(config.PORT);
  config.DB_PORT = parseInt(config.DB_PORT);
  logger.info('✅ Environment validation passed');
  logger.info(`📊 Configuration loaded:`);
  logger.info(`   - Environment: ${config.NODE_ENV}`);
  logger.info(`   - Port: ${config.PORT}`);
  logger.info(`   - Database: ${config.DB_NAME}@${config.DB_HOST}:${config.DB_PORT}`);
  logger.info(`   - JWT Secret: ${'*'.repeat(config.JWT_SECRET.length)} (${config.JWT_SECRET.length} chars)`);
  return config;
}
function validateProductionSecurity(config) {
  if (config.NODE_ENV === 'production') {
    logger.info('🔒 Running production security checks...');
    const securityIssues = [];
    if (config.JWT_SECRET.length < 64) {
      securityIssues.push('JWT_SECRET should be at least 64 characters in production');
    }
    const weakPasswords = ['password', '123456', 'admin', 'root', 'test'];
    if (weakPasswords.some(weak => config.DB_PASS.toLowerCase().includes(weak))) {
      securityIssues.push('Database password appears to be weak');
    }
    if (config.JWT_SECRET === config.DB_PASS) {
      securityIssues.push('JWT_SECRET should not be the same as database password');
    }
    if (securityIssues.length > 0) {
      logger.warn('⚠️  Security warnings for production:');
      securityIssues.forEach(issue => logger.warn(`   - ${issue}`));
    } else {
      logger.info('✅ Production security checks passed');
    }
  }
}
module.exports = {
  validateEnvironment,
  validateEnvFormats,
  validateWhatsAppEnv,
  validateProductionSecurity
};
