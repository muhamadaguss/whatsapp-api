const { getSock } = require("../auth/session");
const Session = require("../models/sessionModel");
const logger = require("../utils/logger");
class AccountMetadataController {
  static async getAccountMetadata(req, res) {
    try {
      const { sessionId } = req.params;
      logger.info(`📊 Fetching metadata for session: ${sessionId}`);
      const byleysData = await AccountMetadataController._getBaileysMetadata(sessionId);
      if (byleysData) {
        logger.info(`✅ [Baileys] Account age detected: ${byleysData.accountAgeInDays} days`);
        return res.json({
          success: true,
          source: 'baileys',
          data: byleysData
        });
      }
      const dbData = await AccountMetadataController._getDatabaseMetadata(sessionId);
      if (dbData) {
        logger.info(`✅ [Database] Account age detected: ${dbData.accountAgeInDays} days`);
        return res.json({
          success: true,
          source: 'database',
          data: dbData
        });
      }
      logger.warn(`⚠️ No account metadata available for ${sessionId}`);
      return res.json({
        success: false,
        source: 'none',
        message: 'Account age could not be determined. Please enter manually.',
        data: null
      });
    } catch (error) {
      logger.error(`❌ Failed to get account metadata:`, error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  static async _getBaileysMetadata(sessionId) {
    try {
      const sock = getSock(sessionId);
      if (!sock || !sock.user) {
        logger.warn(`[Baileys] Socket not available for ${sessionId}`);
        return null;
      }
      const accountInfo = sock.user;
      const phoneNumber = accountInfo.id?.split('@')[0];
      let accountCreatedDate = null;
      let accountAgeInDays = null;
      if (accountInfo.accountCreated) {
        accountCreatedDate = new Date(accountInfo.accountCreated);
        accountAgeInDays = Math.floor(
          (Date.now() - accountCreatedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      } else if (accountInfo.created) {
        accountCreatedDate = new Date(accountInfo.created);
        accountAgeInDays = Math.floor(
          (Date.now() - accountCreatedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      } else {
        logger.warn(`[Baileys] No account creation date in metadata for ${sessionId}`);
        return null;
      }
      return {
        phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
        displayName: accountInfo.name || accountInfo.verifiedName,
        accountCreatedDate: accountCreatedDate?.toISOString(),
        accountAgeInDays,
        metadata: {
          baileysVersion: sock.version || 'unknown',
          isVerified: accountInfo.verifiedName ? true : false
        }
      };
    } catch (error) {
      logger.error(`[Baileys] Error fetching metadata:`, error);
      return null;
    }
  }
  static async _getDatabaseMetadata(sessionId) {
    try {
      const session = await Session.findOne({
        where: { sessionId },
        attributes: ['sessionId', 'phoneNumber', 'displayName', 'createdAt', 'metadata']
      });
      if (!session) {
        logger.warn(`[Database] Session not found: ${sessionId}`);
        return null;
      }
      if (!session.createdAt) {
        logger.warn(`[Database] No createdAt timestamp for ${sessionId}`);
        return null;
      }
      const accountAgeInDays = Math.floor(
        (Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        phoneNumber: session.phoneNumber,
        displayName: session.displayName,
        accountCreatedDate: session.createdAt.toISOString(),
        accountAgeInDays,
        metadata: session.metadata || {}
      };
    } catch (error) {
      logger.error(`[Database] Error fetching metadata:`, error);
      return null;
    }
  }
  static async updateAccountCreationDate(req, res) {
    try {
      const { sessionId } = req.params;
      const { creationDate } = req.body;
      if (!creationDate) {
        return res.status(400).json({
          success: false,
          error: 'Creation date is required'
        });
      }
      const session = await Session.findOne({ where: { sessionId } });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
      const updatedMetadata = {
        ...(session.metadata || {}),
        manualCreationDate: creationDate,
        manuallySet: true,
        manuallySetAt: new Date().toISOString()
      };
      await session.update({
        metadata: updatedMetadata
      });
      logger.info(`✅ Updated manual creation date for ${sessionId}`);
      return res.json({
        success: true,
        message: 'Account creation date updated successfully'
      });
    } catch (error) {
      logger.error(`❌ Failed to update account creation date:`, error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
module.exports = AccountMetadataController;
