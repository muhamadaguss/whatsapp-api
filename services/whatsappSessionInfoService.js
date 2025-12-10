const logger = require("../utils/logger");
const Session = require("../models/sessionModel");
const { getSock } = require("../auth/session");
class WhatsAppSessionInfoService {
  static async updateSessionInfo(sessionId, sessionInfo) {
    try {
      const updateData = {
        lastSeen: new Date(),
        ...sessionInfo
      };
      await Session.update(updateData, {
        where: { sessionId },
      });
      logger.info(`✅ Updated session info for ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to update session info for ${sessionId}:`, error);
      return false;
    }
  }
  static async getAccountProfile(sessionId) {
    try {
      const sock = getSock(sessionId);
      if (!sock) {
        return null;
      }
      let profilePicture = null;
      try {
        const profilePictureUrl = await sock.profilePictureUrl(sock.user.id);
        if (profilePictureUrl) {
          profilePicture = profilePictureUrl;
        }
      } catch (err) {
        logger.warn(`Could not get profile picture for ${sessionId}`);
      }
      const phoneNumber = sock.user?.id?.split('@')[0] || null;
      const displayName = sock.user?.name || sock.user?.verifiedName || `Account ${phoneNumber}`;
      const connectionQuality = this.determineConnectionQuality(sock);
      const operatorInfo = this.getOperatorInfo(phoneNumber);
      const accountInfo = {
        phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
        displayName,
        status: 'connected',
        profilePicture,
        connectionQuality,
        metadata: {
          operatorInfo,
          lastProfileUpdate: new Date().toISOString()
        }
      };
      await this.updateSessionInfo(sessionId, accountInfo);
      return accountInfo;
    } catch (error) {
      logger.error(`❌ Failed to get account profile for ${sessionId}:`, error);
      return null;
    }
  }
  static determineConnectionQuality(sock) {
    if (!sock || !sock.ws) {
      return 'poor';
    }
    const wsState = sock.ws.readyState;
    switch (wsState) {
      case 1: 
        return 'excellent';
      case 0: 
        return 'good';
      case 2: 
      case 3: 
        return 'poor';
      default:
        return 'unknown';
    }
  }
  static getOperatorInfo(phoneNumber) {
    if (!phoneNumber) return null;
    const operators = {
      '811': { provider: 'Telkomsel', type: 'Postpaid' },
      '812': { provider: 'Telkomsel', type: 'Postpaid' },
      '813': { provider: 'Telkomsel', type: 'Postpaid' },
      '821': { provider: 'Telkomsel', type: 'Prepaid' },
      '822': { provider: 'Telkomsel', type: 'Prepaid' },
      '823': { provider: 'Telkomsel', type: 'Prepaid' },
      '852': { provider: 'Telkomsel', type: 'Prepaid' },
      '853': { provider: 'Telkomsel', type: 'Prepaid' },
      '814': { provider: 'Indosat', type: 'Postpaid' },
      '815': { provider: 'Indosat', type: 'Postpaid' },
      '816': { provider: 'Indosat', type: 'Postpaid' },
      '855': { provider: 'Indosat', type: 'Prepaid' },
      '856': { provider: 'Indosat', type: 'Prepaid' },
      '857': { provider: 'Indosat', type: 'Prepaid' },
      '858': { provider: 'Indosat', type: 'Prepaid' },
      '817': { provider: 'XL', type: 'Postpaid' },
      '818': { provider: 'XL', type: 'Postpaid' },
      '819': { provider: 'XL', type: 'Postpaid' },
      '859': { provider: 'XL', type: 'Prepaid' },
      '877': { provider: 'XL', type: 'Prepaid' },
      '878': { provider: 'XL', type: 'Prepaid' },
      '831': { provider: 'Axis', type: 'Prepaid' },
      '832': { provider: 'Axis', type: 'Prepaid' },
      '833': { provider: 'Axis', type: 'Prepaid' },
      '838': { provider: 'Axis', type: 'Prepaid' },
      '881': { provider: 'Smartfren', type: 'Prepaid' },
      '882': { provider: 'Smartfren', type: 'Prepaid' },
      '883': { provider: 'Smartfren', type: 'Prepaid' },
      '884': { provider: 'Smartfren', type: 'Prepaid' },
      '885': { provider: 'Smartfren', type: 'Prepaid' },
      '886': { provider: 'Smartfren', type: 'Prepaid' },
      '887': { provider: 'Smartfren', type: 'Prepaid' },
      '888': { provider: 'Smartfren', type: 'Prepaid' },
      '889': { provider: 'Smartfren', type: 'Prepaid' },
      '895': { provider: 'Three', type: 'Prepaid' },
      '896': { provider: 'Three', type: 'Prepaid' },
      '897': { provider: 'Three', type: 'Prepaid' },
      '898': { provider: 'Three', type: 'Prepaid' },
      '899': { provider: 'Three', type: 'Prepaid' },
    };
    const cleanNumber = phoneNumber.replace(/^\+62/, '');
    const prefix = cleanNumber.substring(0, 3);
    return operators[prefix] || { provider: 'Unknown', type: 'Unknown' };
  }
  static async updateConnectionStatus(sessionId, status) {
    try {
      await Session.update(
        { 
          status,
          lastSeen: new Date()
        },
        { where: { sessionId } }
      );
      logger.info(`✅ Updated connection status for ${sessionId}: ${status}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to update connection status for ${sessionId}:`, error);
      return false;
    }
  }
  static async batchUpdateSessionInfo(sessionIds) {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        const accountInfo = await this.getAccountProfile(sessionId);
        results.push({ sessionId, success: !!accountInfo, data: accountInfo });
      } catch (error) {
        results.push({ sessionId, success: false, error: error.message });
      }
    }
    logger.info(`✅ Batch updated ${results.length} sessions`);
    return results;
  }
}
module.exports = WhatsAppSessionInfoService;
