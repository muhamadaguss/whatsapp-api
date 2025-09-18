const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const { getSock } = require("../auth/session");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const sessionPersistence = require("../utils/sessionPersistence");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { AppError } = require("../middleware/errorHandler");
const blastExecutionService = require("../services/blastExecutionService"); // Import blastExecutionService
const xlsx = require("xlsx"); // Add Excel processing support
const fs = require("fs"); // Add file system support
const SpinTextEngine = require("../utils/spinTextEngine"); // Add spin text support
const BlastRealTimeService = require("../services/blastRealTimeService");

// Create singleton instance
const blastRealTimeService = new BlastRealTimeService(); // Import real-time service

// Phase 3 Services
const AnalyticsService = require("../services/analyticsService");
const PhoneValidationService = require("../services/phoneValidationService");
const AutoRetryService = require("../services/autoRetryService");
const BulkOperationsService = require("../services/bulkOperationsService");
const RetryConfiguration = require("../models/retryConfigurationModel");

/**
 * Helper: Validate WhatsApp availability for session messages
 * @param {string} sessionId - Session ID
 * @param {string} whatsappSessionId - WhatsApp session ID
 * @param {boolean} skipValidation - Skip validation if true
 * @returns {Object} Validation result
 */
const validateSessionPhoneNumbers = async (sessionId, whatsappSessionId, skipValidation = false) => {
  try {
    // Skip validation if explicitly requested (for force-start)
    if (skipValidation) {
      return {
        success: true,
        message: "Phone validation skipped (force mode)",
        totalMessages: 0,
        validNumbers: 0,
        invalidNumbers: 0,
        details: []
      };
    }

    // Get WhatsApp socket
    const sock = getSock(whatsappSessionId);
    if (!sock) {
      throw new AppError(
        `WhatsApp session ${whatsappSessionId} not found or not active. Please connect WhatsApp first.`,
        400
      );
    }

    // Get all pending messages for this session
    const messages = await BlastMessage.findAll({
      where: { 
        sessionId,
        status: 'pending'
      },
      limit: 100 // Limit validation to first 100 numbers for performance
    });

    if (messages.length === 0) {
      return {
        success: true,
        message: "No pending messages to validate",
        totalMessages: 0,
        validNumbers: 0,
        invalidNumbers: 0,
        details: []
      };
    }

    logger.info(`📱 Validating ${messages.length} phone numbers for session ${sessionId}`);

    const validationResults = [];
    let validCount = 0;
    let invalidCount = 0;

    // Validate phone numbers in batches to avoid overwhelming WhatsApp API
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      // Process batch
      const batchPromises = batch.map(async (message) => {
        try {
          const jid = `${message.phone}@s.whatsapp.net`;
          const onWhatsAppResult = await sock.onWhatsApp(jid);
          
          const isValid = onWhatsAppResult && onWhatsAppResult.length > 0;
          const result = {
            phone: message.phone,
            contactName: message.contactName,
            isValid,
            verifiedName: isValid ? onWhatsAppResult[0].verifiedName : null,
            messageIndex: message.messageIndex
          };

          if (isValid) {
            validCount++;
          } else {
            invalidCount++;
          }

          return result;
        } catch (error) {
          logger.warn(`Failed to validate ${message.phone}:`, error.message);
          invalidCount++;
          return {
            phone: message.phone,
            contactName: message.contactName,
            isValid: false,
            error: error.message,
            messageIndex: message.messageIndex
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      validationResults.push(...batchResults);

      // Add small delay between batches
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successRate = messages.length > 0 ? (validCount / messages.length) * 100 : 0;

    logger.info(`📱 Phone validation completed: ${validCount}/${messages.length} valid (${successRate.toFixed(1)}%)`);

    return {
      success: true,
      message: `Phone validation completed: ${validCount}/${messages.length} valid numbers`,
      totalMessages: messages.length,
      validNumbers: validCount,
      invalidNumbers: invalidCount,
      successRate: successRate,
      details: validationResults,
      recommendation: successRate < 50 ? 
        "Warning: More than 50% of numbers are invalid. Consider reviewing your contact list." :
        successRate < 80 ? 
        "Note: Some numbers may not receive messages. You can proceed with caution." :
        "Good: Most numbers are valid for WhatsApp delivery."
    };

  } catch (error) {
    logger.error(`❌ Failed to validate phone numbers for session ${sessionId}:`, error);
    throw error;
  }
};

/**
 * Helper: Mark invalid phone numbers as failed in database
 * @param {string} sessionId - Session ID
 * @param {Array} validationDetails - Phone validation results
 */
const markInvalidNumbersAsFailed = async (sessionId, validationDetails) => {
  try {
    const invalidNumbers = validationDetails.filter(item => !item.isValid);
    
    if (invalidNumbers.length === 0) {
      logger.info(`📱 No invalid numbers found for session ${sessionId}`);
      return;
    }

    logger.info(`📱 Marking ${invalidNumbers.length} invalid numbers as failed for session ${sessionId}`);
    
    // Update blast_messages table for invalid numbers
    const updatePromises = invalidNumbers.map(async (item) => {
      logger.info(`🔄 Updating phone ${item.phone} to failed status`);
      
      const updateResult = await BlastMessage.update(
        {
          status: 'failed',
          errorMessage: 'Phone number not available on WhatsApp',
          failedAt: new Date()
        },
        {
          where: {
            sessionId: sessionId,
            phone: item.phone
          }
        }
      );
      
      logger.info(`📝 Update result for ${item.phone}: ${updateResult[0]} rows affected`);
      
      // Verify the update
      const verifyRecord = await BlastMessage.findOne({
        where: { sessionId, phone: item.phone }
      });
      
      if (verifyRecord) {
        logger.info(`✅ Verified ${item.phone} status: ${verifyRecord.status}`);
      } else {
        logger.warn(`⚠️ Could not find record for ${item.phone} after update`);
      }
      
      return updateResult;
    });

    await Promise.all(updatePromises);

    // Update blast session failed count
    await BlastSession.increment(
      { failedCount: invalidNumbers.length },
      { 
        where: { sessionId: sessionId }
      }
    );

    // Recalculate progress using the real-time service for consistency
    const session = await BlastSession.findOne({
      where: { sessionId: sessionId }
    });

    if (session) {
      const progressPercentage = blastRealTimeService.calculateProgressPercentage(session);

      await BlastSession.update(
        { progressPercentage },
        { where: { sessionId: sessionId } }
      );

      // Emit real-time progress update
      await blastRealTimeService.emitSessionProgress(sessionId, {
        invalidNumbersMarked: invalidNumbers.length,
        reason: 'Invalid phone numbers marked as failed'
      });
    }

    logger.info(`📱 Marked ${invalidNumbers.length} invalid numbers as failed for session ${sessionId}`);

  } catch (error) {
    logger.error(`❌ Failed to mark invalid numbers as failed for session ${sessionId}:`, error);
    throw error;
  }
};

const emitSessionUpdate = async (userId = null) => {
  try {
    // Use the enhanced real-time service for session updates
    await blastRealTimeService.emitSessionsUpdate(userId);
    logger.debug(`📡 Emitted sessions update via real-time service${userId ? ` for user ${userId}` : ' for all users'}`);
  } catch (error) {
    logger.error("❌ Failed to emit session update via real-time service:", error);
    // Fallback to original implementation if needed
    try {
      if (userId) {
        const userSessions = await BlastSession.findAll({
          where: { userId },
          include: [
            {
              model: require("../models/sessionModel"),
              as: "whatsappSession",
              attributes: ["sessionId", "phoneNumber", "displayName", "status"]
            }
          ],
          order: [["createdAt", "DESC"]],
        });

        // Transform whatsappSession to whatsappAccount for frontend compatibility
        const transformedSessions = userSessions.map(session => {
          const sessionData = session.toJSON();
          
          // Transform whatsappSession to whatsappAccount
          if (sessionData.whatsappSession) {
            sessionData.whatsappAccount = {
              sessionId: sessionData.whatsappSession.sessionId,
              phoneNumber: sessionData.whatsappSession.phoneNumber,
              displayName: sessionData.whatsappSession.displayName || `Account ${sessionData.whatsappSession.phoneNumber}`,
              status: sessionData.whatsappSession.status,
              profilePicture: sessionData.whatsappSession.profilePicture,
              lastSeen: sessionData.whatsappSession.lastSeen,
              connectionQuality: sessionData.whatsappSession.connectionQuality || 'unknown',
              operatorInfo: sessionData.whatsappSession.metadata?.operatorInfo || null
            };
          } else {
            // Fallback untuk missing WhatsApp session data
            sessionData.whatsappAccount = {
              sessionId: sessionData.whatsappSessionId,
              phoneNumber: null,
              displayName: 'Account Information Unavailable',
              status: 'unknown',
              profilePicture: null,
              lastSeen: null,
              connectionQuality: 'unknown',
              operatorInfo: null
            };
          }

          // Remove the nested whatsappSession object
          delete sessionData.whatsappSession;
          
          return sessionData;
        });

        getSocket().to(`user_${userId}`).emit("sessions-update", transformedSessions);
      } else {
        const allUsers = await BlastSession.findAll({
          attributes: ['userId'],
          group: ['userId'],
          raw: true
        });
        
        for (const userObj of allUsers) {
          const userSessions = await BlastSession.findAll({
            where: { userId: userObj.userId },
            include: [
              {
                model: require("../models/sessionModel"),
                as: "whatsappSession",
                attributes: ["sessionId", "phoneNumber", "displayName", "status"]
              }
            ],
            order: [["createdAt", "DESC"]],
          });

          // Transform whatsappSession to whatsappAccount for frontend compatibility
          const transformedSessions = userSessions.map(session => {
            const sessionData = session.toJSON();
            
            // Transform whatsappSession to whatsappAccount
            if (sessionData.whatsappSession) {
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSession.sessionId,
                phoneNumber: sessionData.whatsappSession.phoneNumber,
                displayName: sessionData.whatsappSession.displayName || `Account ${sessionData.whatsappSession.phoneNumber}`,
                status: sessionData.whatsappSession.status,
                profilePicture: sessionData.whatsappSession.profilePicture,
                lastSeen: sessionData.whatsappSession.lastSeen,
                connectionQuality: sessionData.whatsappSession.connectionQuality || 'unknown',
                operatorInfo: sessionData.whatsappSession.metadata?.operatorInfo || null
              };
            } else {
              // Fallback untuk missing WhatsApp session data
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSessionId,
                phoneNumber: null,
                displayName: 'Account Information Unavailable',
                status: 'unknown',
                profilePicture: null,
                lastSeen: null,
                connectionQuality: 'unknown',
                operatorInfo: null
              };
            }

            // Remove the nested whatsappSession object
            delete sessionData.whatsappSession;
            
            return sessionData;
          });

          getSocket().to(`user_${userObj.userId}`).emit("sessions-update", transformedSessions);
        }
      }
    } catch (fallbackError) {
      logger.error("❌ Fallback session update also failed:", fallbackError);
    }
  }
};

/**
 * Blast Control Controller
 * Handles all blast session control operations
 */

/**
 * Parse Excel file and convert to messageList format
 * Reuses logic from excelService.js for consistency
 */
const parseExcelToMessageList = (filePath, selectTarget = null, inputNumbers = null) => {
  try {
    let rows = [];
    
    if (selectTarget === "input" && inputNumbers) {
      // Parse manual input (like in excelService.js)
      rows = inputNumbers
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const [no, name] = line.split("|").map((part) => part.trim());
          const row = { no };
          if (name) row.name = name;
          return row;
        });
    } else {
      // Parse Excel file (like in excelService.js)
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet);
    }

    // Convert to Enhanced Blast messageList format
    const messageList = rows.map((row) => ({
      phone: String(row["no"] || row["phone"] || "").replace(/\D/g, ""),
      contactName: row["name"] || row["contactName"] || undefined,
      variables: {
        name: row["name"] || "",
        company: row["company"] || "",
        custom1: row["custom1"] || "",
        custom2: row["custom2"] || "",
        // Add any other columns as variables
        ...Object.keys(row).reduce((vars, key) => {
          if (!["no", "phone", "name", "contactName"].includes(key)) {
            vars[key] = row[key] || "";
          }
          return vars;
        }, {})
      }
    })).filter(item => item.phone.length > 0); // Filter out entries without phone numbers

    logger.info(`📊 Parsed Excel: ${messageList.length} valid contacts from ${rows.length} rows`);
    return messageList;
  } catch (error) {
    logger.error(`❌ Failed to parse Excel file:`, error);
    throw new AppError(`Failed to parse Excel file: ${error.message}`, 400);
  }
};

/**
 * Create new blast session
 * Supports both messageList array and Excel file upload
 */
const createBlastSession = async (req, res) => {
  const {
    whatsappSessionId,
    campaignName,
    messageTemplate,
    messageList,
    config = {},
    selectTarget,
    inputNumbers
  } = req.body;

  const filePath = req.file?.path; // Excel file path from multer

  // Basic validation
  if (!whatsappSessionId || !messageTemplate) {
    throw new AppError(
      "Missing required fields: whatsappSessionId, messageTemplate",
      400
    );
  }

  let finalMessageList = [];

  try {
    // Determine data source and parse accordingly
    if (messageList && Array.isArray(messageList) && messageList.length > 0) {
      // Method 1: Direct messageList array (from Enhanced Creator frontend parsing)
      finalMessageList = messageList;
      logger.info(`📝 Using provided messageList: ${messageList.length} contacts`);
    } else if (filePath || (selectTarget === "input" && inputNumbers)) {
      // Method 2: Excel file upload or manual input (like legacy blast)
      finalMessageList = parseExcelToMessageList(filePath, selectTarget, inputNumbers);
      logger.info(`📊 Parsed from file/input: ${finalMessageList.length} contacts`);
    } else {
      throw new AppError(
        "No data source provided. Please provide messageList array, Excel file, or manual input",
        400
      );
    }

    if (finalMessageList.length === 0) {
      throw new AppError("No valid contacts found", 400);
    }

    // Create blast session
    const result = await blastSessionManager.createSession({
      userId: req.user.id,
      whatsappSessionId,
      campaignName: campaignName || `Campaign ${Date.now()}`,
      messageTemplate,
      messageList: finalMessageList,
      config,
    });

    logger.info(
      `✅ Blast session created by user ${req.user.id}: ${result.sessionId} with ${finalMessageList.length} messages`
    );

    // Emit session update to user
    await emitSessionUpdate(req.user.id);

    res.status(201).json({
      success: true,
      message: "Blast session created successfully",
      data: {
        sessionId: result.sessionId,
        totalMessages: result.totalMessages,
        status: "IDLE",
      },
    });
  } catch (error) {
    logger.error(
      `❌ Failed to create blast session for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to create blast session: ${error.message}`, 500);
  } finally {
    // Cleanup temporary Excel file if it exists
    if (filePath) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`🗑️ Temporary Excel file cleaned up: ${filePath}`);
        }
      } catch (cleanupError) {
        logger.warn(`⚠️ Failed to cleanup temporary file: ${cleanupError.message}`);
      }
    }
  }
};

/**
 * Start blast session
 */
const startBlastSession = async (req, res) => {
  const { sessionId } = req.params;
  const { skipPhoneValidation = false } = req.body; // Optional parameter

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // 📱 VALIDATE PHONE NUMBERS FIRST
    let phoneValidationResult = null;
    try {
      phoneValidationResult = await validateSessionPhoneNumbers(
        sessionId, 
        session.whatsappSessionId, 
        skipPhoneValidation
      );

      // If validation found invalid numbers, mark them as failed in database
      if (!skipPhoneValidation && phoneValidationResult.invalidNumbers > 0) {
        await markInvalidNumbersAsFailed(sessionId, phoneValidationResult.details);
        
        // 🛡️ ADD DELAY to ensure database transaction is committed
        logger.info(`⏳ Waiting 2 seconds to ensure database changes are committed...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info(
          `📱 Phone validation completed for session ${sessionId}: ${phoneValidationResult.validNumbers}/${phoneValidationResult.totalMessages} valid numbers. ${phoneValidationResult.invalidNumbers} invalid numbers marked as failed.`
        );
      }

    } catch (validationError) {
      if (validationError instanceof AppError) {
        throw validationError;
      }
      logger.warn(`Phone validation failed for session ${sessionId}:`, validationError.message);
      // Continue without validation if there's a technical error
      phoneValidationResult = {
        success: false,
        message: `Phone validation failed: ${validationError.message}`,
        totalMessages: 0,
        validNumbers: 0,
        invalidNumbers: 0
      };
    }

    // Check if business hours are enabled and if current time is outside business hours
    const businessHoursConfig = session.config?.businessHours;
    logger.info(`[startBlastSession] Session ${sessionId} businessHoursConfig: ${JSON.stringify(businessHoursConfig)}`);
    const isWithinHours = blastExecutionService.isWithinBusinessHours(businessHoursConfig);
    logger.info(`[startBlastSession] Session ${sessionId} isWithinBusinessHours: ${isWithinHours}`);

    let isPausedDueToBusinessHours = false; // Initialize flag

    if (
      businessHoursConfig &&
      businessHoursConfig.enabled &&
      !blastExecutionService.isWithinBusinessHours(businessHoursConfig)
    ) {
      logger.info(`Attempting to emit notification for session ${sessionId} due to business hours.`);
      getSocket().to(`user_${req.user.id}`).emit("notification", {
        type: "warning",
        message: `Blast session ${sessionId} will be paused until business hours (${businessHoursConfig.startHour}:00 - ${businessHoursConfig.endHour}:00).`,
      });
      logger.info(
        `⏰ Notification emitted for session ${sessionId}: Blast session will be paused due to business hours.`
      );
      isPausedDueToBusinessHours = true; // Set flag if condition met
    }

    // Start session
    const result = await blastSessionManager.startSession(sessionId);

    logger.info(
      `▶️ Blast session started by user ${req.user.id}: ${sessionId}`
    );

    // Emit session update to user
    await emitSessionUpdate(req.user.id);

    // Prepare success message based on phone validation results
    let successMessage = "Blast session started successfully";
    if (phoneValidationResult && phoneValidationResult.invalidNumbers > 0) {
      successMessage = `Blast session started. ${phoneValidationResult.validNumbers}/${phoneValidationResult.totalMessages} numbers are valid. ${phoneValidationResult.invalidNumbers} invalid numbers marked as failed.`;
    }

    res.json({
      success: true,
      message: successMessage,
      data: {
        ...result, // Include existing result data
        isPausedDueToBusinessHours: isPausedDueToBusinessHours, // Add the new flag
        phoneValidation: phoneValidationResult, // Include phone validation results
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to start blast session ${sessionId}:`, error);
    throw new AppError(`Failed to start blast session: ${error.message}`, 500);
  }
};

/**
 * Pause blast session
 */
const pauseBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Pause session
    const result = await blastSessionManager.pauseSession(sessionId);

    logger.info(`⏸️ Blast session paused by user ${req.user.id}: ${sessionId}`);

    // Emit session update to user
    await emitSessionUpdate(req.user.id);

    res.json({
      success: true,
      message: "Blast session paused successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to pause blast session ${sessionId}:`, error);
    throw new AppError(`Failed to pause blast session: ${error.message}`, 500);
  }
};

/**
 * Resume blast session
 */
const resumeBlastSession = async (req, res) => {
  const { sessionId } = req.params;
  const { skipPhoneValidation = false } = req.body; // Optional parameter

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // 📱 VALIDATE REMAINING PHONE NUMBERS
    let phoneValidationResult = null;
    try {
      phoneValidationResult = await validateSessionPhoneNumbers(
        sessionId, 
        session.whatsappSessionId, 
        skipPhoneValidation
      );

      // If validation shows no pending messages, that's actually good
      if (phoneValidationResult.totalMessages === 0) {
        phoneValidationResult.message = "No pending messages to validate (all messages processed)";
      } else if (!skipPhoneValidation && phoneValidationResult.invalidNumbers > 0) {
        // Mark invalid numbers as failed for resume as well
        await markInvalidNumbersAsFailed(sessionId, phoneValidationResult.details);
        
        logger.info(
          `📱 Phone validation completed for resume session ${sessionId}: ${phoneValidationResult.validNumbers}/${phoneValidationResult.totalMessages} valid numbers. ${phoneValidationResult.invalidNumbers} invalid numbers marked as failed.`
        );
      }

    } catch (validationError) {
      logger.warn(`Phone validation failed for session ${sessionId}:`, validationError.message);
      // Continue without validation for resume (less strict than start)
      phoneValidationResult = {
        success: false,
        message: `Phone validation failed: ${validationError.message}`,
        totalMessages: 0,
        validNumbers: 0,
        invalidNumbers: 0
      };
    }

    // Resume session
    const result = await blastSessionManager.resumeSession(sessionId);

    logger.info(
      `▶️ Blast session resumed by user ${req.user.id}: ${sessionId}`
    );

    // Emit session update to user
    await emitSessionUpdate(req.user.id);

    // Prepare success message based on phone validation results
    let successMessage = "Blast session resumed successfully";
    if (phoneValidationResult && phoneValidationResult.invalidNumbers > 0) {
      successMessage = `Blast session resumed. ${phoneValidationResult.validNumbers}/${phoneValidationResult.totalMessages} pending numbers are valid. ${phoneValidationResult.invalidNumbers} invalid numbers marked as failed.`;
    }

    res.json({
      success: true,
      message: successMessage,
      data: {
        ...result,
        phoneValidation: phoneValidationResult, // Include phone validation results
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to resume blast session ${sessionId}:`, error);
    throw new AppError(`Failed to resume blast session: ${error.message}`, 500);
  }
};

/**
 * Stop blast session
 */
const stopBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Stop session
    const result = await blastSessionManager.stopSession(sessionId);

    logger.info(
      `⏹️ Blast session stopped by user ${req.user.id}: ${sessionId}`
    );

    // Emit session update to user
    await emitSessionUpdate(req.user.id);

    res.json({
      success: true,
      message: "Blast session stopped successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to stop blast session ${sessionId}:`, error);
    throw new AppError(`Failed to stop blast session: ${error.message}`, 500);
  }
};

/**
 * Get blast session status
 */
const getBlastStatus = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get status
    const status = await blastSessionManager.getSessionStatus(sessionId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`❌ Failed to get blast status ${sessionId}:`, error);
    throw new AppError(`Failed to get blast status: ${error.message}`, 500);
  }
};

/**
 * Get blast session progress
 */
const getBlastProgress = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get progress
    const status = await blastSessionManager.getSessionStatus(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        progress: status.progress,
        status: status.status,
        timestamps: status.timestamps,
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get blast progress ${sessionId}:`, error);
    throw new AppError(`Failed to get blast progress: ${error.message}`, 500);
  }
};

/**
 * Get user's blast sessions
 */
const getUserBlastSessions = async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  try {
    const whereClause = { userId: req.user.id };

    if (status) {
      whereClause.status = status;
    }

    // Import Session model untuk include
    const Session = require("../models/sessionModel");

    const { count, rows: sessions } = await BlastSession.findAndCountAll({
      where: whereClause,
      include: [{
        model: Session,
        as: 'whatsappSession',
        attributes: [
          'sessionId', 
          'phoneNumber', 
          'displayName', 
          'status', 
          'profilePicture',
          'lastSeen',
          'connectionQuality',
          'metadata'
        ],
        required: false // LEFT JOIN untuk handle missing WhatsApp sessions
      }],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Transform data untuk include WhatsApp account information
    const transformedSessions = sessions.map(session => {
      const sessionData = session.toJSON();
      
      // Extract WhatsApp account information
      if (sessionData.whatsappSession) {
        sessionData.whatsappAccount = {
          sessionId: sessionData.whatsappSession.sessionId,
          phoneNumber: sessionData.whatsappSession.phoneNumber,
          displayName: sessionData.whatsappSession.displayName || `Account ${sessionData.whatsappSession.phoneNumber}`,
          status: sessionData.whatsappSession.status,
          profilePicture: sessionData.whatsappSession.profilePicture,
          lastSeen: sessionData.whatsappSession.lastSeen,
          connectionQuality: sessionData.whatsappSession.connectionQuality || 'unknown',
          operatorInfo: sessionData.whatsappSession.metadata?.operatorInfo || null
        };
      } else {
        // Fallback untuk missing WhatsApp session data
        sessionData.whatsappAccount = {
          sessionId: sessionData.whatsappSessionId,
          phoneNumber: null,
          displayName: 'Account Information Unavailable',
          status: 'unknown',
          profilePicture: null,
          lastSeen: null,
          connectionQuality: 'unknown',
          operatorInfo: null
        };
      }

      // Remove the nested whatsappSession object
      delete sessionData.whatsappSession;
      
      return sessionData;
    });

    res.json({
      success: true,
      data: {
        sessions: transformedSessions,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < count,
        },
      },
    });
  } catch (error) {
    logger.error(
      `❌ Failed to get user blast sessions for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to get blast sessions: ${error.message}`, 500);
  }
};

/**
 * Get session messages
 */
const getSessionMessages = async (req, res) => {
  const { sessionId } = req.params;
  const { status, limit = 100, offset = 0 } = req.query;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    const whereClause = { sessionId };

    if (status) {
      whereClause.status = status;
    }

    const { count, rows: messages } = await BlastMessage.findAndCountAll({
      where: whereClause,
      order: [["messageIndex", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < count,
        },
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get session messages ${sessionId}:`, error);
    throw new AppError(`Failed to get session messages: ${error.message}`, 500);
  }
};

/**
 * Retry failed messages
 */
const retryFailedMessages = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Reset failed messages for retry
    const resetCount = await messageQueueHandler.resetFailedMessages(sessionId);

    logger.info(
      `🔄 Reset ${resetCount} failed messages for retry in session ${sessionId}`
    );

    res.json({
      success: true,
      message: `${resetCount} failed messages reset for retry`,
      data: { resetCount },
    });
  } catch (error) {
    logger.error(`❌ Failed to retry failed messages ${sessionId}:`, error);
    throw new AppError(
      `Failed to retry failed messages: ${error.message}`,
      500
    );
  }
};

/**
 * Recover active sessions
 */
const recoverActiveSessions = async (req, res) => {
  try {
    const result = await sessionPersistence.recoverSessions(req.user.id);

    logger.info(
      `🔄 Recovered sessions for user ${req.user.id}: ${result.recoveredSessions.length}`
    );

    res.json({
      success: true,
      message: `Recovered ${result.recoveredSessions.length} active sessions`,
      data: result,
    });
  } catch (error) {
    logger.error(
      `❌ Failed to recover sessions for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to recover sessions: ${error.message}`, 500);
  }
};

/**
 * Cleanup session
 */
const cleanupSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Only allow cleanup of completed/stopped sessions
    if (!["COMPLETED", "STOPPED", "ERROR"].includes(session.status)) {
      throw new AppError(
        "Can only cleanup completed, stopped, or error sessions",
        400
      );
    }

    // Delete messages first
    const deletedMessages = await BlastMessage.destroy({
      where: { sessionId },
    });

    // Delete session
    await BlastSession.destroy({
      where: { sessionId },
    });

    logger.info(
      `🗑️ Cleaned up session ${sessionId}: ${deletedMessages} messages deleted`
    );

    res.json({
      success: true,
      message: "Session cleaned up successfully",
      data: { deletedMessages },
    });
  } catch (error) {
    logger.error(`❌ Failed to cleanup session ${sessionId}:`, error);
    throw new AppError(`Failed to cleanup session: ${error.message}`, 500);
  }
};

/**
 * Get system health
 */
const getSystemHealth = async (req, res) => {
  try {
    const activeSessions = blastSessionManager.getActiveSessions();

    const totalSessions = await BlastSession.count();
    const activeDatabaseSessions = await BlastSession.count({
      where: { status: ["RUNNING", "PAUSED"] },
    });

    const health = {
      status: "healthy",
      activeSessions: activeSessions.length,
      totalSessions,
      activeDatabaseSessions,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error("❌ Failed to get system health:", error);
    throw new AppError(`Failed to get system health: ${error.message}`, 500);
  }
};

/**
 * Get session statistics
 */
const getSessionStats = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get queue statistics
    const stats = await messageQueueHandler.getQueueStats(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        ...stats,
        session: {
          status: session.status,
          campaignName: session.campaignName,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        },
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get session stats ${sessionId}:`, error);
    throw new AppError(`Failed to get session stats: ${error.message}`, 500);
  }
};

/**
 * Force start blast session (bypass business hours)
 */
const forceStartBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Force start session (bypass business hours)
    const result = await blastExecutionService.forceStartExecution(sessionId);

    logger.info(
      `🚀 Blast session force started by user ${req.user.id}: ${sessionId}`
    );

    res.json({
      success: true,
      message: "Blast session force started successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to force start blast session ${sessionId}:`, error);
    throw new AppError(`Failed to force start blast session: ${error.message}`, 500);
  }
};

const handleSessionAction = async (req, res) => {
  const { sessionId } = req.params;
  const { action } = req.body;

  switch (action) {
    case "start":
      return startBlastSession(req, res);
    case "force-start":
      return forceStartBlastSession(req, res);
    case "pause":
      return pauseBlastSession(req, res);
    case "resume":
      return resumeBlastSession(req, res);
    case "stop":
      return stopBlastSession(req, res);
    case "validate-phones": // New action for phone validation
      return validateSessionPhones(req, res);
    default:
      throw new AppError(`Invalid action: ${action}`, 400);
  }
};

/**
 * Validate phone numbers for a session (manual validation)
 */
const validateSessionPhones = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Validate phone numbers
    const phoneValidationResult = await validateSessionPhoneNumbers(
      sessionId, 
      session.whatsappSessionId, 
      false // Never skip validation for manual check
    );

    logger.info(
      `📱 Manual phone validation completed for session ${sessionId} by user ${req.user.id}`
    );

    res.json({
      success: true,
      message: "Phone numbers validation completed",
      data: phoneValidationResult,
    });
  } catch (error) {
    logger.error(`❌ Failed to validate phone numbers for session ${sessionId}:`, error);
    throw new AppError(`Failed to validate phone numbers: ${error.message}`, 500);
  }
};

// =============================================================================
// PHASE 3 - ADVANCED FEATURES ENDPOINTS
// =============================================================================

/**
 * Get advanced analytics for a session
 */
const getSessionAnalytics = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const analytics = await AnalyticsService.getSessionAnalytics(sessionId, req.user.id);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error(`❌ Failed to get analytics for session ${sessionId}:`, error);
    throw new AppError(`Failed to get analytics: ${error.message}`, 500);
  }
};

/**
 * Get dashboard analytics (multi-session overview)
 */
const getDashboardAnalytics = async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const analytics = await AnalyticsService.getDashboardAnalytics(req.user.id, parseInt(limit));

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error(`❌ Failed to get dashboard analytics for user ${req.user.id}:`, error);
    throw new AppError(`Failed to get dashboard analytics: ${error.message}`, 500);
  }
};

/**
 * Export analytics data
 */
const exportAnalytics = async (req, res) => {
  const { sessionId } = req.params;
  const { format = 'csv' } = req.query;

  try {
    const analytics = await AnalyticsService.getSessionAnalytics(sessionId, req.user.id);
    
    if (format === 'csv') {
      const csvData = AnalyticsService.exportAnalyticsToCSV(analytics);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics_${sessionId}.csv"`);
      res.send(csvData);
    } else {
      res.json({
        success: true,
        data: analytics,
      });
    }
  } catch (error) {
    logger.error(`❌ Failed to export analytics for session ${sessionId}:`, error);
    throw new AppError(`Failed to export analytics: ${error.message}`, 500);
  }
};

/**
 * Validate phone numbers (batch)
 */
const validatePhoneNumbers = async (req, res) => {
  const { phoneNumbers, options = {} } = req.body;

  try {
    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      throw new AppError("Phone numbers array is required", 400);
    }

    if (phoneNumbers.length > 10000) {
      throw new AppError("Maximum 10,000 phone numbers allowed per batch", 400);
    }

    const validationResult = await PhoneValidationService.validateBatch(phoneNumbers, options);

    res.json({
      success: true,
      data: validationResult,
    });
  } catch (error) {
    logger.error(`❌ Failed to validate phone numbers:`, error);
    throw new AppError(`Failed to validate phone numbers: ${error.message}`, 500);
  }
};

/**
 * Validate single phone number
 */
const validateSinglePhone = async (req, res) => {
  const { phoneNumber, options = {} } = req.body;

  try {
    if (!phoneNumber) {
      throw new AppError("Phone number is required", 400);
    }

    const validationResult = await PhoneValidationService.validateSingle(phoneNumber, options);

    res.json({
      success: true,
      data: validationResult,
    });
  } catch (error) {
    logger.error(`❌ Failed to validate phone number:`, error);
    throw new AppError(`Failed to validate phone number: ${error.message}`, 500);
  }
};

/**
 * Export phone validation results
 */
const exportPhoneValidation = async (req, res) => {
  const { phoneNumbers, format = 'csv' } = req.body;

  try {
    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      throw new AppError("Phone numbers array is required", 400);
    }

    const validationResult = await PhoneValidationService.validateBatch(phoneNumbers, {
      returnDetails: true
    });

    const exportResult = await PhoneValidationService.exportValidationResults(validationResult, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="phone_validation.csv"');
      res.send(exportResult.content);
    } else {
      res.json({
        success: true,
        data: exportResult,
      });
    }
  } catch (error) {
    logger.error(`❌ Failed to export phone validation:`, error);
    throw new AppError(`Failed to export phone validation: ${error.message}`, 500);
  }
};

/**
 * Configure auto retry for a session
 */
const configureAutoRetry = async (req, res) => {
  const { sessionId } = req.params;
  const retryConfig = req.body;

  try {
    const result = await AutoRetryService.enableAutoRetry(sessionId, retryConfig, req.user.id);

    logger.info(`✅ Auto retry configured for session ${sessionId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: "Auto retry configured successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to configure auto retry for session ${sessionId}:`, error);
    throw new AppError(`Failed to configure auto retry: ${error.message}`, 500);
  }
};

/**
 * Disable auto retry for a session
 */
const disableAutoRetry = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await AutoRetryService.disableAutoRetry(sessionId, req.user.id);

    logger.info(`🛑 Auto retry disabled for session ${sessionId} by user ${req.user.id}`);

    res.json({
      success: true,
      message: "Auto retry disabled successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to disable auto retry for session ${sessionId}:`, error);
    throw new AppError(`Failed to disable auto retry: ${error.message}`, 500);
  }
};

/**
 * Get auto retry status for a session
 */
const getAutoRetryStatus = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const status = await AutoRetryService.getRetryStatus(sessionId, req.user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`❌ Failed to get auto retry status for session ${sessionId}:`, error);
    throw new AppError(`Failed to get auto retry status: ${error.message}`, 500);
  }
};

/**
 * Pause auto retry for a session
 */
const pauseAutoRetry = async (req, res) => {
  const { sessionId } = req.params;
  const { durationMinutes = 60 } = req.body;

  try {
    const result = await AutoRetryService.pauseRetries(sessionId, req.user.id, durationMinutes);

    res.json({
      success: true,
      message: `Auto retry paused for ${durationMinutes} minutes`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to pause auto retry for session ${sessionId}:`, error);
    throw new AppError(`Failed to pause auto retry: ${error.message}`, 500);
  }
};

/**
 * Resume auto retry for a session
 */
const resumeAutoRetry = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await AutoRetryService.resumeRetries(sessionId, req.user.id);

    res.json({
      success: true,
      message: "Auto retry resumed",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to resume auto retry for session ${sessionId}:`, error);
    throw new AppError(`Failed to resume auto retry: ${error.message}`, 500);
  }
};

/**
 * Force retry specific messages
 */
const forceRetryMessages = async (req, res) => {
  const { messageIds } = req.body;

  try {
    if (!messageIds || !Array.isArray(messageIds)) {
      throw new AppError("Message IDs array is required", 400);
    }

    const result = await AutoRetryService.forceRetryMessages(messageIds, req.user.id);

    res.json({
      success: true,
      message: `${result.length} messages queued for retry`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to force retry messages:`, error);
    throw new AppError(`Failed to force retry messages: ${error.message}`, 500);
  }
};

/**
 * Bulk retry failed messages across multiple sessions
 */
const bulkRetryFailedMessages = async (req, res) => {
  const { sessionIds, options = {} } = req.body;

  try {
    if (!sessionIds || !Array.isArray(sessionIds)) {
      throw new AppError("Session IDs array is required", 400);
    }

    if (sessionIds.length > 50) {
      throw new AppError("Maximum 50 sessions allowed per bulk operation", 400);
    }

    const result = await BulkOperationsService.bulkRetryFailedMessages(sessionIds, req.user.id, options);

    logger.info(`🔄 Bulk retry completed for ${sessionIds.length} sessions by user ${req.user.id}`);

    res.json({
      success: true,
      message: `Bulk retry completed for ${result.processedSessions} sessions`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to perform bulk retry:`, error);
    throw new AppError(`Failed to perform bulk retry: ${error.message}`, 500);
  }
};

/**
 * Bulk update message status
 */
const bulkUpdateMessageStatus = async (req, res) => {
  const { messageIds, newStatus } = req.body;

  try {
    if (!messageIds || !Array.isArray(messageIds)) {
      throw new AppError("Message IDs array is required", 400);
    }

    if (!newStatus) {
      throw new AppError("New status is required", 400);
    }

    if (messageIds.length > 1000) {
      throw new AppError("Maximum 1000 messages allowed per bulk update", 400);
    }

    const result = await BulkOperationsService.bulkUpdateMessageStatus(messageIds, newStatus, req.user.id);

    res.json({
      success: true,
      message: `${result.updatedCount} messages updated`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to bulk update message status:`, error);
    throw new AppError(`Failed to bulk update message status: ${error.message}`, 500);
  }
};

/**
 * Bulk delete messages
 */
const bulkDeleteMessages = async (req, res) => {
  const { messageIds } = req.body;

  try {
    if (!messageIds || !Array.isArray(messageIds)) {
      throw new AppError("Message IDs array is required", 400);
    }

    if (messageIds.length > 1000) {
      throw new AppError("Maximum 1000 messages allowed per bulk delete", 400);
    }

    const result = await BulkOperationsService.bulkDeleteMessages(messageIds, req.user.id);

    res.json({
      success: true,
      message: `${result.deletedCount} messages deleted`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to bulk delete messages:`, error);
    throw new AppError(`Failed to bulk delete messages: ${error.message}`, 500);
  }
};

/**
 * Bulk validate phone numbers
 */
const bulkValidatePhoneNumbers = async (req, res) => {
  const { phoneNumbers, options = {} } = req.body;

  try {
    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
      throw new AppError("Phone numbers array is required", 400);
    }

    if (phoneNumbers.length > 10000) {
      throw new AppError("Maximum 10,000 phone numbers allowed per batch", 400);
    }

    const result = await BulkOperationsService.bulkValidatePhoneNumbers(phoneNumbers, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to bulk validate phone numbers:`, error);
    throw new AppError(`Failed to bulk validate phone numbers: ${error.message}`, 500);
  }
};

/**
 * Bulk pause/resume campaigns
 */
const bulkCampaignControl = async (req, res) => {
  const { sessionIds, action } = req.body;

  try {
    if (!sessionIds || !Array.isArray(sessionIds)) {
      throw new AppError("Session IDs array is required", 400);
    }

    if (!action || !['pause', 'resume'].includes(action)) {
      throw new AppError("Action must be 'pause' or 'resume'", 400);
    }

    if (sessionIds.length > 50) {
      throw new AppError("Maximum 50 sessions allowed per bulk operation", 400);
    }

    const result = await BulkOperationsService.bulkCampaignControl(sessionIds, action, req.user.id);

    res.json({
      success: true,
      message: `Bulk ${action} completed for ${result.successfulOperations} sessions`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to perform bulk campaign control:`, error);
    throw new AppError(`Failed to perform bulk campaign control: ${error.message}`, 500);
  }
};

/**
 * Bulk export campaign data
 */
const bulkExportCampaignData = async (req, res) => {
  const { sessionIds, options = {} } = req.body;

  try {
    if (!sessionIds || !Array.isArray(sessionIds)) {
      throw new AppError("Session IDs array is required", 400);
    }

    if (sessionIds.length > 20) {
      throw new AppError("Maximum 20 sessions allowed per bulk export", 400);
    }

    const result = await BulkOperationsService.bulkExportCampaignData(sessionIds, req.user.id, options);

    if (options.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.sendFile(result.filepath);
    } else {
      res.json({
        success: true,
        message: "Export completed successfully",
        data: result,
      });
    }
  } catch (error) {
    logger.error(`❌ Failed to bulk export campaign data:`, error);
    throw new AppError(`Failed to bulk export campaign data: ${error.message}`, 500);
  }
};

/**
 * Bulk cleanup campaigns
 */
const bulkCleanupCampaigns = async (req, res) => {
  const { sessionIds, options = {} } = req.body;

  try {
    if (!sessionIds || !Array.isArray(sessionIds)) {
      throw new AppError("Session IDs array is required", 400);
    }

    if (sessionIds.length > 50) {
      throw new AppError("Maximum 50 sessions allowed per bulk cleanup", 400);
    }

    const result = await BulkOperationsService.bulkCleanupCampaigns(sessionIds, req.user.id, options);

    res.json({
      success: true,
      message: `Cleanup completed for ${result.cleanedSessions} sessions`,
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to bulk cleanup campaigns:`, error);
    throw new AppError(`Failed to bulk cleanup campaigns: ${error.message}`, 500);
  }
};

/**
 * Get auto retry service status
 */
const getAutoRetryServiceStatus = async (req, res) => {
  try {
    const status = AutoRetryService.getServiceStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`❌ Failed to get auto retry service status:`, error);
    throw new AppError(`Failed to get auto retry service status: ${error.message}`, 500);
  }
};

module.exports = {
  // Existing endpoints
  createBlastSession,
  startBlastSession,
  forceStartBlastSession,
  pauseBlastSession,
  resumeBlastSession,
  stopBlastSession,
  getBlastStatus,
  getBlastProgress,
  getUserBlastSessions,
  getSessionMessages,
  retryFailedMessages,
  recoverActiveSessions,
  cleanupSession,
  getSystemHealth,
  getSessionStats,
  handleSessionAction,
  validateSessionPhones, // New endpoint

  // Phase 3 - Advanced Analytics
  getSessionAnalytics,
  getDashboardAnalytics,
  exportAnalytics,

  // Phase 3 - Phone Validation
  validatePhoneNumbers,
  validateSinglePhone,
  exportPhoneValidation,

  // Phase 3 - Auto Retry Configuration
  configureAutoRetry,
  disableAutoRetry,
  getAutoRetryStatus,
  pauseAutoRetry,
  resumeAutoRetry,
  forceRetryMessages,
  getAutoRetryServiceStatus,

  // Phase 3 - Bulk Operations
  bulkRetryFailedMessages,
  bulkUpdateMessageStatus,
  bulkDeleteMessages,
  bulkValidatePhoneNumbers,
  bulkCampaignControl,
  bulkExportCampaignData,
  bulkCleanupCampaigns,
};