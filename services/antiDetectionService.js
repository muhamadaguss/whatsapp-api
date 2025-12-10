const logger = require("../utils/logger");
class AntiDetectionService {
  constructor() {
    this.userAgents = [
      'WhatsApp/2.23.20.0 Android/12',
      'WhatsApp/2.23.19.81 Android/11',
      'WhatsApp/2.23.18.76 Android/13',
      'WhatsApp/23.20.79 iOS/16.5',
      'WhatsApp/23.19.80 iOS/16.4',
      'WhatsApp/23.18.77 iOS/15.7',
    ];
    this.deviceFingerprints = [
      { manufacturer: 'Samsung', model: 'SM-G998B', androidVersion: '12' },
      { manufacturer: 'Xiaomi', model: 'M2102J20SG', androidVersion: '11' },
      { manufacturer: 'OPPO', model: 'CPH2021', androidVersion: '11' },
      { manufacturer: 'Apple', model: 'iPhone13,2', iosVersion: '16.5' },
      { manufacturer: 'Apple', model: 'iPhone14,3', iosVersion: '16.4' },
      { manufacturer: 'Vivo', model: 'V2061', androidVersion: '12' },
    ];
    this.sessionFingerprints = new Map();
    this.patternThresholds = {
      maxSameIntervalCount: 3, 
      minTimingVariance: 0.15, 
      maxPerfectSequence: 5 
    };
    this.timingHistory = new Map();
  }
  getSessionFingerprint(sessionId) {
    if (this.sessionFingerprints.has(sessionId)) {
      return this.sessionFingerprints.get(sessionId);
    }
    const fingerprint = this.generateFingerprint();
    this.sessionFingerprints.set(sessionId, fingerprint);
    logger.info(`🔐 [AntiDetect] New fingerprint for session ${sessionId}: ${fingerprint.deviceId}`);
    return fingerprint;
  }
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
  generateDeviceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 16; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
  rotateFingerprint(sessionId) {
    const newFingerprint = this.generateFingerprint();
    this.sessionFingerprints.set(sessionId, newFingerprint);
    logger.info(`🔄 [AntiDetect] Rotated fingerprint for session ${sessionId}`);
    return newFingerprint;
  }
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
    if (Math.random() > 0.5) {
      headers['X-Client-Timestamp'] = Date.now().toString();
    }
    if (Math.random() > 0.5) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }
    return headers;
  }
  getRandomLanguage() {
    const languages = [
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'en-US,en;q=0.9,id;q=0.8',
      'id;q=0.9,en;q=0.8',
    ];
    return languages[Math.floor(Math.random() * languages.length)];
  }
  applyTimingJitter(delayMs, jitterPercent = 0.20) {
    const jitter = delayMs * jitterPercent * (Math.random() * 2 - 1);
    const jitteredDelay = Math.max(0, delayMs + jitter);
    return Math.round(jitteredDelay);
  }
  recordTiming(sessionId, operation, timing) {
    if (!this.timingHistory.has(sessionId)) {
      this.timingHistory.set(sessionId, []);
    }
    const history = this.timingHistory.get(sessionId);
    history.push({ operation, timing, timestamp: Date.now() });
    if (history.length > 100) {
      history.shift();
    }
  }
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
    const variance = this.calculateVariance(intervals);
    if (variance < this.patternThresholds.minTimingVariance) {
      issues.push({
        type: 'LOW_VARIANCE',
        severity: 'MEDIUM',
        variance: variance.toFixed(3),
        message: `Timing variance too low (${(variance*100).toFixed(1)}%)`
      });
    }
    const perfectSequences = this.detectPerfectSequences(intervals);
    if (perfectSequences > this.patternThresholds.maxPerfectSequence) {
      issues.push({
        type: 'PERFECT_SEQUENCE',
        severity: 'HIGH',
        count: perfectSequences,
        message: `Perfect sequential pattern detected ${perfectSequences} times`
      });
    }
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
  countRepeatedValues(values) {
    const counts = {};
    let maxCount = 0;
    values.forEach(val => {
      const rounded = Math.round(val / 1000) * 1000; 
      counts[rounded] = (counts[rounded] || 0) + 1;
      maxCount = Math.max(maxCount, counts[rounded]);
    });
    return maxCount;
  }
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean; 
  }
  detectPerfectSequences(intervals) {
    let perfectCount = 0;
    for (let i = 0; i < intervals.length - 2; i++) {
      const diff1 = Math.abs(intervals[i] - intervals[i+1]);
      const diff2 = Math.abs(intervals[i+1] - intervals[i+2]);
      if (diff1 < 100 && diff2 < 100) {
        perfectCount++;
      }
    }
    return perfectCount;
  }
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
  resetSession(sessionId) {
    this.sessionFingerprints.delete(sessionId);
    this.timingHistory.delete(sessionId);
    logger.info(`[AntiDetect] Reset session ${sessionId}`);
  }
  clearAll() {
    this.sessionFingerprints.clear();
    this.timingHistory.clear();
    logger.warn('[AntiDetect] All data cleared');
  }
}
let instance = null;
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
