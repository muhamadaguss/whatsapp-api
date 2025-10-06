/**
 * Anti-Detection Service - PHASE 3 TASK [P3-6]
 * 
 * Security & Anti-Detection Enhancements
 * 
 * Features:
 * - Fingerprint randomization
 * - User-agent rotation
 * - Request header variation
 * - Timing jitter on all operations
 * - Anti-pattern self-check
 * 
 * @module antiDetectionService
 */

const logger = require("../utils/logger");

class AntiDetectionService {
  constructor() {
    // User agent pool (realistic mobile devices)
    this.userAgents = [
      'WhatsApp/2.23.20.0 Android/12',
      'WhatsApp/2.23.19.81 Android/11',
      'WhatsApp/2.23.18.76 Android/13',
      'WhatsApp/23.20.79 iOS/16.5',
      'WhatsApp/23.19.80 iOS/16.4',
      'WhatsApp/23.18.77 iOS/15.7',
    ];
    
    // Device fingerprints
    this.deviceFingerprints = [
      { manufacturer: 'Samsung', model: 'SM-G998B', androidVersion: '12' },
      { manufacturer: 'Xiaomi', model: 'M2102J20SG', androidVersion: '11' },
      { manufacturer: 'OPPO', model: 'CPH2021', androidVersion: '11' },
      { manufacturer: 'Apple', model: 'iPhone13,2', iosVersion: '16.5' },
      { manufacturer: 'Apple', model: 'iPhone14,3', iosVersion: '16.4' },
      { manufacturer: 'Vivo', model: 'V2061', androidVersion: '12' },
    ];
    
    // Current session fingerprints
    this.sessionFingerprints = new Map();
    
    // Pattern detection thresholds
    this.patternThresholds = {
      maxSameIntervalCount: 3, // Max times same interval can repeat
      minTimingVariance: 0.15, // Minimum 15% variance required
      maxPerfectSequence: 5 // Max perfect sequential patterns
    };
    
    // Anti-pattern tracking
    this.timingHistory = new Map();
  }

  /**
   * Get or create fingerprint for session
   * @param {string} sessionId - Session ID
   * @returns {Object} Device fingerprint
   */
  getSessionFingerprint(sessionId) {
    if (this.sessionFingerprints.has(sessionId)) {
      return this.sessionFingerprints.get(sessionId);
    }
    
    // Generate new fingerprint
    const fingerprint = this.generateFingerprint();
    this.sessionFingerprints.set(sessionId, fingerprint);
    
    logger.info(`🔐 [AntiDetect] New fingerprint for session ${sessionId}: ${fingerprint.deviceId}`);
    
    return fingerprint;
  }

  /**
   * Generate random device fingerprint
   * @returns {Object} Fingerprint
   */
  generateFingerprint() {
    const device = this.deviceFingerprints[Math.floor(Math.random() * this.deviceFingerprints.length)];
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    
    return {
      deviceId: this.generateDeviceId(),
      manufacturer: device.manufacturer,
      model: device.model,
      osVersion: device.androidVersion || device.iosVersion,
      userAgent,
      appVersion: userAgent.split('/')[1].split(' ')[0],
      timestamp: Date.now()
    };
  }

  /**
   * Generate realistic device ID
   * @returns {string} Device ID
   */
  generateDeviceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 16; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Rotate fingerprint for session (periodic rotation)
   * @param {string} sessionId - Session ID
   */
  rotateFingerprint(sessionId) {
    const newFingerprint = this.generateFingerprint();
    this.sessionFingerprints.set(sessionId, newFingerprint);
    
    logger.info(`🔄 [AntiDetect] Rotated fingerprint for session ${sessionId}`);
    
    return newFingerprint;
  }

  /**
   * Get varied request headers
   * @param {string} sessionId - Session ID
   * @returns {Object} Headers
   */
  getVariedHeaders(sessionId) {
    const fingerprint = this.getSessionFingerprint(sessionId);
    
    const headers = {
      'User-Agent': fingerprint.userAgent,
      'Accept-Language': this.getRandomLanguage(),
      'X-Device-ID': fingerprint.deviceId,
      'X-Device-Model': fingerprint.model,
      'X-Device-Manufacturer': fingerprint.manufacturer,
      'X-OS-Version': fingerprint.osVersion,
      'X-App-Version': fingerprint.appVersion,
    };
    
    // Add random optional headers (50% chance)
    if (Math.random() > 0.5) {
      headers['X-Client-Timestamp'] = Date.now().toString();
    }
    
    if (Math.random() > 0.5) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }
    
    return headers;
  }

  /**
   * Get random language preference
   * @returns {string} Language code
   */
  getRandomLanguage() {
    const languages = [
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'en-US,en;q=0.9,id;q=0.8',
      'id;q=0.9,en;q=0.8',
    ];
    
    return languages[Math.floor(Math.random() * languages.length)];
  }

  /**
   * Apply timing jitter to delay
   * @param {number} delayMs - Base delay in ms
   * @param {number} jitterPercent - Jitter percentage (default 20%)
   * @returns {number} Jittered delay
   */
  applyTimingJitter(delayMs, jitterPercent = 0.20) {
    const jitter = delayMs * jitterPercent * (Math.random() * 2 - 1);
    const jitteredDelay = Math.max(0, delayMs + jitter);
    
    return Math.round(jitteredDelay);
  }

  /**
   * Record timing for pattern detection
   * @param {string} sessionId - Session ID
   * @param {string} operation - Operation type
   * @param {number} timing - Timing in ms
   */
  recordTiming(sessionId, operation, timing) {
    if (!this.timingHistory.has(sessionId)) {
      this.timingHistory.set(sessionId, []);
    }
    
    const history = this.timingHistory.get(sessionId);
    history.push({ operation, timing, timestamp: Date.now() });
    
    // Keep only last 100 timings
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Self-check for bot patterns
   * @param {string} sessionId - Session ID
   * @returns {Object} Pattern detection result
   */
  detectBotPatterns(sessionId) {
    const history = this.timingHistory.get(sessionId);
    
    if (!history || history.length < 10) {
      return {
        detected: false,
        reason: 'Insufficient data',
        confidence: 0
      };
    }
    
    const issues = [];
    
    // Check for repeated exact intervals
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i].timing - history[i-1].timing);
    }
    
    const sameIntervalCount = this.countRepeatedValues(intervals);
    if (sameIntervalCount > this.patternThresholds.maxSameIntervalCount) {
      issues.push({
        type: 'REPEATED_INTERVALS',
        severity: 'HIGH',
        count: sameIntervalCount,
        message: `Same interval repeated ${sameIntervalCount} times`
      });
    }
    
    // Check timing variance
    const variance = this.calculateVariance(intervals);
    if (variance < this.patternThresholds.minTimingVariance) {
      issues.push({
        type: 'LOW_VARIANCE',
        severity: 'MEDIUM',
        variance: variance.toFixed(3),
        message: `Timing variance too low (${(variance*100).toFixed(1)}%)`
      });
    }
    
    // Check for perfect sequences
    const perfectSequences = this.detectPerfectSequences(intervals);
    if (perfectSequences > this.patternThresholds.maxPerfectSequence) {
      issues.push({
        type: 'PERFECT_SEQUENCE',
        severity: 'HIGH',
        count: perfectSequences,
        message: `Perfect sequential pattern detected ${perfectSequences} times`
      });
    }
    
    // Calculate confidence score
    const confidence = issues.length > 0 
      ? Math.min(1.0, issues.length / 3)
      : 0;
    
    const result = {
      detected: issues.length > 0,
      issues,
      confidence: Math.round(confidence * 100),
      recommendation: this.getRecommendation(issues)
    };
    
    if (result.detected) {
      logger.warn(`⚠️ [AntiDetect] Bot patterns detected in session ${sessionId}: ${result.issues.length} issues, ${result.confidence}% confidence`);
    }
    
    return result;
  }

  /**
   * Count repeated values in array
   * @param {Array<number>} values - Values
   * @returns {number} Max repetition count
   */
  countRepeatedValues(values) {
    const counts = {};
    let maxCount = 0;
    
    values.forEach(val => {
      const rounded = Math.round(val / 1000) * 1000; // Round to nearest second
      counts[rounded] = (counts[rounded] || 0) + 1;
      maxCount = Math.max(maxCount, counts[rounded]);
    });
    
    return maxCount;
  }

  /**
   * Calculate variance coefficient
   * @param {Array<number>} values - Values
   * @returns {number} Coefficient of variation
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev / mean; // Coefficient of variation
  }

  /**
   * Detect perfect sequential patterns
   * @param {Array<number>} intervals - Intervals
   * @returns {number} Count of perfect sequences
   */
  detectPerfectSequences(intervals) {
    let perfectCount = 0;
    
    for (let i = 0; i < intervals.length - 2; i++) {
      const diff1 = Math.abs(intervals[i] - intervals[i+1]);
      const diff2 = Math.abs(intervals[i+1] - intervals[i+2]);
      
      // If differences are very small (< 100ms), it's suspiciously perfect
      if (diff1 < 100 && diff2 < 100) {
        perfectCount++;
      }
    }
    
    return perfectCount;
  }

  /**
   * Get recommendation based on detected issues
   * @param {Array} issues - Detected issues
   * @returns {string} Recommendation
   */
  getRecommendation(issues) {
    if (issues.length === 0) {
      return 'Behavior appears natural';
    }
    
    const highSeverity = issues.filter(i => i.severity === 'HIGH').length;
    
    if (highSeverity > 0) {
      return 'URGENT: Increase randomization and variance immediately';
    }
    
    return 'Moderate concerns: Add more natural pauses and variation';
  }

  /**
   * Get anti-detection statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      activeSessions: this.sessionFingerprints.size,
      fingerprintsGenerated: this.sessionFingerprints.size,
      timingHistorySize: this.timingHistory.size,
      availableUserAgents: this.userAgents.length,
      availableDevices: this.deviceFingerprints.length,
      patternThresholds: this.patternThresholds
    };
  }

  /**
   * Reset session fingerprint
   * @param {string} sessionId - Session ID
   */
  resetSession(sessionId) {
    this.sessionFingerprints.delete(sessionId);
    this.timingHistory.delete(sessionId);
    logger.info(`[AntiDetect] Reset session ${sessionId}`);
  }

  /**
   * Clear all data
   */
  clearAll() {
    this.sessionFingerprints.clear();
    this.timingHistory.clear();
    logger.warn('[AntiDetect] All data cleared');
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of AntiDetectionService
 * @returns {AntiDetectionService}
 */
function getAntiDetectionService() {
  if (!instance) {
    instance = new AntiDetectionService();
  }
  return instance;
}

module.exports = {
  AntiDetectionService,
  getAntiDetectionService
};
