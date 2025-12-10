const { DataTypes } = require('sequelize');
const sequelize = require('./db');
const RetryConfiguration = sequelize.define(
  'RetryConfiguration',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Blast session ID this config belongs to',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'User who owns this configuration',
    },
    maxRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: 'Maximum number of retry attempts per message',
    },
    retryDelay: {
      type: DataTypes.INTEGER,
      defaultValue: 300, 
      comment: 'Delay between retries in seconds',
    },
    exponentialBackoff: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Use exponential backoff for retry delays',
    },
    businessHoursEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Only retry during business hours',
    },
    businessHoursStart: {
      type: DataTypes.STRING,
      defaultValue: '09:00',
      comment: 'Business hours start time (HH:MM format)',
    },
    businessHoursEnd: {
      type: DataTypes.STRING,
      defaultValue: '17:00',
      comment: 'Business hours end time (HH:MM format)',
    },
    businessTimezone: {
      type: DataTypes.STRING,
      defaultValue: 'Asia/Jakarta',
      comment: 'Timezone for business hours',
    },
    businessDays: {
      type: DataTypes.JSON,
      defaultValue: [1, 2, 3, 4, 5], 
      comment: 'Days of week for business hours (0=Sunday, 6=Saturday)',
    },
    messagesPerMinute: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      comment: 'Maximum messages to retry per minute',
    },
    batchSize: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      comment: 'Number of messages to retry in each batch',
    },
    batchDelay: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      comment: 'Delay between batches in seconds',
    },
    maxConcurrentRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: 'Maximum concurrent retry operations',
    },
    retryableErrors: {
      type: DataTypes.JSON,
      defaultValue: ['timeout', 'network', 'rate_limit'],
      comment: 'Error types that should be retried',
    },
    skipMaxRetriesReached: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Skip messages that reached max retries',
    },
    errorRateThreshold: {
      type: DataTypes.FLOAT,
      defaultValue: 0.5,
      comment: 'Pause auto-retry if error rate exceeds this threshold',
    },
    pauseOnHighErrorRate: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Automatically pause when error rate is high',
    },
    notificationsEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Send notifications for retry operations',
    },
    emailNotifications: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Send email notifications',
    },
    webhookUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Webhook URL for notifications',
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether auto-retry is enabled for this session',
    },
    isPaused: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether auto-retry is temporarily paused',
    },
    lastRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time auto-retry was executed',
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Next scheduled retry time',
    },
    totalRetryAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total number of retry attempts made',
    },
    successfulRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of successful retries',
    },
    failedRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of failed retries',
    },
    configVersion: {
      type: DataTypes.STRING,
      defaultValue: '1.0',
      comment: 'Configuration schema version',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'retry_configurations',
    timestamps: true,
    indexes: [
      {
        fields: ['sessionId'],
        unique: true,
      },
      {
        fields: ['userId'],
      },
      {
        fields: ['isEnabled'],
      },
      {
        fields: ['nextRetryAt'],
      },
    ],
  }
);
RetryConfiguration.associate = (models) => {
  RetryConfiguration.belongsTo(models.BlastSession, {
    foreignKey: 'sessionId',
    targetKey: 'sessionId',
    as: 'blastSession',
  });
  RetryConfiguration.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user',
  });
};
RetryConfiguration.prototype.isBusinessHours = function() {
  if (!this.businessHoursEnabled) return true;
  const now = new Date();
  const timezone = this.businessTimezone || 'Asia/Jakarta';
  const businessTime = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
  const dayOfWeek = businessTime.getDay();
  const currentTime = businessTime.getHours() * 60 + businessTime.getMinutes();
  if (!this.businessDays.includes(dayOfWeek)) {
    return false;
  }
  const [startHour, startMinute] = this.businessHoursStart.split(':').map(Number);
  const [endHour, endMinute] = this.businessHoursEnd.split(':').map(Number);
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  return currentTime >= startTime && currentTime <= endTime;
};
RetryConfiguration.prototype.getNextRetryDelay = function(retryCount = 1) {
  let delay = this.retryDelay;
  if (this.exponentialBackoff) {
    delay = this.retryDelay * Math.pow(2, retryCount - 1);
    delay = Math.min(delay, 3600);
  }
  return delay;
};
RetryConfiguration.prototype.shouldRetryError = function(errorType) {
  return this.retryableErrors.includes(errorType.toLowerCase());
};
RetryConfiguration.prototype.updateStats = function(success = true) {
  this.totalRetryAttempts += 1;
  if (success) {
    this.successfulRetries += 1;
  } else {
    this.failedRetries += 1;
  }
  this.lastRetryAt = new Date();
  return this.save();
};
RetryConfiguration.getDefaultConfig = function() {
  return {
    maxRetries: 3,
    retryDelay: 300,
    exponentialBackoff: true,
    businessHoursEnabled: false,
    businessHoursStart: '09:00',
    businessHoursEnd: '17:00',
    businessTimezone: 'Asia/Jakarta',
    businessDays: [1, 2, 3, 4, 5],
    messagesPerMinute: 10,
    batchSize: 5,
    batchDelay: 30,
    maxConcurrentRetries: 3,
    retryableErrors: ['timeout', 'network', 'rate_limit'],
    skipMaxRetriesReached: true,
    errorRateThreshold: 0.5,
    pauseOnHighErrorRate: true,
    notificationsEnabled: true,
    emailNotifications: false,
    isEnabled: false,
  };
};
module.exports = RetryConfiguration;
