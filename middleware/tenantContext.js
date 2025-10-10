/**
 * Tenant Context Middleware
 * 
 * Extracts organization context from JWT token and adds to request object.
 * This middleware should be applied AFTER authentication middleware.
 * 
 * Usage:
 *   const { tenantContext } = require('./middleware/tenantContext');
 *   router.get('/path', authenticate, tenantContext, handler);
 */

const logger = require("../utils/logger");

/**
 * Extract organizationId from authenticated user and add to request
 * Assumes req.user exists (from authentication middleware)
 */
const tenantContext = (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please login to access this resource",
      });
    }

    // Extract organizationId from user
    const { organizationId, roleInOrg, id: userId } = req.user;

    // Check if user has organization
    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: "No organization",
        message: "User is not associated with any organization. Please contact support.",
      });
    }

    // Add tenant context to request
    req.tenant = {
      organizationId,
      roleInOrg: roleInOrg || "member",
      userId,
    };

    // Log tenant context for debugging (only in development)
    if (process.env.NODE_ENV === "development") {
      logger.debug(`Tenant context set: organizationId=${organizationId}, role=${roleInOrg}`);
    }

    next();
  } catch (error) {
    logger.error("Error in tenantContext middleware:", error);
    return res.status(500).json({
      success: false,
      error: "Tenant context error",
      message: "Failed to establish tenant context",
    });
  }
};

/**
 * Optional tenant context - doesn't fail if no organization
 * Useful for endpoints that can work with or without organization context
 */
const optionalTenantContext = (req, res, next) => {
  try {
    if (req.user && req.user.organizationId) {
      req.tenant = {
        organizationId: req.user.organizationId,
        roleInOrg: req.user.roleInOrg || "member",
        userId: req.user.id,
      };
    }
    next();
  } catch (error) {
    logger.error("Error in optionalTenantContext middleware:", error);
    next(); // Continue anyway for optional context
  }
};

/**
 * Check if user has specific role in organization
 * Usage: requireRole('owner', 'admin')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(403).json({
        success: false,
        error: "Tenant context required",
        message: "This action requires organization context",
      });
    }

    const { roleInOrg } = req.tenant;

    if (!allowedRoles.includes(roleInOrg)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
        userRole: roleInOrg,
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
};

module.exports = {
  tenantContext,
  optionalTenantContext,
  requireRole,
};
