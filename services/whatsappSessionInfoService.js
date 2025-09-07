/**
 * WhatsApp Session Information Service
 * Handles updating and retrieving WhatsApp account information
 */

const logger = require("../utils/logger");
const Session = require("../models/sessionModel");
const { getSock } = require("../auth/session");

class WhatsAppSessionInfoService {
  /**
   * Update WhatsApp session information
   * @param {string} sessionId - WhatsApp session ID
   * @param {Object} sessionInfo - Session information to update
   */
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

  /**
   * Get WhatsApp account profile information
   * @param {string} sessionId - WhatsApp session ID
   */
  static async getAccountProfile(sessionId) {
    try {
      const sock = getSock(sessionId);
      if (!sock) {
        return null;
      }

      // Get profile picture
      let profilePicture = null;
      try {
        const profilePictureUrl = await sock.profilePictureUrl(sock.user.id);
        if (profilePictureUrl) {
          // Convert to base64 or store URL
          profilePicture = profilePictureUrl;
        }
      } catch (err) {
        logger.warn(`Could not get profile picture for ${sessionId}`);
      }

      // Get phone number and other info
      const phoneNumber = sock.user?.id?.split('@')[0] || null;
      const displayName = sock.user?.name || sock.user?.verifiedName || `Account ${phoneNumber}`;

      // Determine connection quality based on recent activity
      const connectionQuality = this.determineConnectionQuality(sock);

      // Get operator information (if available)
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

      // Update database
      await this.updateSessionInfo(sessionId, accountInfo);

      return accountInfo;
    } catch (error) {
      logger.error(`❌ Failed to get account profile for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Determine connection quality based on WebSocket state
   * @param {Object} sock - WhatsApp socket instance
   */
  static determineConnectionQuality(sock) {
    if (!sock || !sock.ws) {
      return 'poor';
    }

    const wsState = sock.ws.readyState;
    switch (wsState) {
      case 1: // OPEN
        return 'excellent';
      case 0: // CONNECTING
        return 'good';
      case 2: // CLOSING
      case 3: // CLOSED
        return 'poor';
      default:
        return 'unknown';
    }
  }

  /**
   * Get operator information based on phone number
   * @param {string} phoneNumber - Phone number
   */
  static getOperatorInfo(phoneNumber) {
    if (!phoneNumber) return null;

    // Indonesian operator detection
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

    // Extract first 3 digits after country code
    const cleanNumber = phoneNumber.replace(/^\+62/, '');
    const prefix = cleanNumber.substring(0, 3);
    
    return operators[prefix] || { provider: 'Unknown', type: 'Unknown' };
  }

  /**
   * Update connection status untuk session
   * @param {string} sessionId - WhatsApp session ID
   * @param {string} status - Status (connected, disconnected, connecting)
   */
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

  /**
   * Batch update session information untuk multiple sessions
   * @param {Array} sessionIds - Array of session IDs
   */
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
