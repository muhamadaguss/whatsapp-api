/**
 * Organization Controller
 * 
 * Handles HTTP requests for organization management.
 */

const organizationService = require("../services/organizationService");
const logger = require("../utils/logger");

class OrganizationController {
  /**
   * GET /api/organizations/:id
   * Get organization by ID
   */
  async getOrganization(req, res) {
    try {
      const { id } = req.params;
      const { includeOwner } = req.query;

      // Verify user has access to this organization
      if (req.tenant && req.tenant.organizationId !== id) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "You don't have access to this organization",
        });
      }

      const organization = await organizationService.getOrganizationWithSubscription(id);

      return res.status(200).json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error("Error in getOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/organizations/current
   * Get current user's organization
   */
  async getCurrentOrganization(req, res) {
    try {
      if (!req.tenant || !req.tenant.organizationId) {
        return res.status(404).json({
          success: false,
          error: "No organization",
          message: "User is not associated with any organization",
        });
      }

      const organization = await organizationService.getOrganizationWithSubscription(
        req.tenant.organizationId
      );

      return res.status(200).json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error("Error in getCurrentOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/organizations
   * Create new organization
   */
  async createOrganization(req, res) {
    try {
      const { name, email, phone, slug, settings, timezone, currency } = req.body;

      // Validate required fields
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          message: "Name and email are required",
        });
      }

      const organization = await organizationService.createOrganization(
        { name, email, phone, slug, settings, timezone, currency },
        req.user.id
      );

      // Update user with new organization
      const User = require("../models/userModel");
      await User.update(
        {
          organizationId: organization.id,
          roleInOrg: "owner",
        },
        {
          where: { id: req.user.id },
        }
      );

      return res.status(201).json({
        success: true,
        message: "Organization created successfully",
        data: organization,
      });
    } catch (error) {
      logger.error("Error in createOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * PUT /api/organizations/:id
   * Update organization
   */
  async updateOrganization(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Verify user has access to this organization
      if (req.tenant && req.tenant.organizationId !== id) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "You don't have access to this organization",
        });
      }

      // Only owner and admin can update organization
      if (!["owner", "admin"].includes(req.tenant.roleInOrg)) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owners and admins can update organization",
        });
      }

      const organization = await organizationService.updateOrganization(id, updates);

      return res.status(200).json({
        success: true,
        message: "Organization updated successfully",
        data: organization,
      });
    } catch (error) {
      logger.error("Error in updateOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/organizations/:id/suspend
   * Suspend organization
   */
  async suspendOrganization(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Only owner can suspend
      if (req.tenant.roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owner can suspend organization",
        });
      }

      const organization = await organizationService.suspendOrganization(
        id,
        reason || "Suspended by owner"
      );

      return res.status(200).json({
        success: true,
        message: "Organization suspended successfully",
        data: organization,
      });
    } catch (error) {
      logger.error("Error in suspendOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/organizations/:id/reactivate
   * Reactivate organization
   */
  async reactivateOrganization(req, res) {
    try {
      const { id } = req.params;

      // Only owner can reactivate
      if (req.tenant.roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owner can reactivate organization",
        });
      }

      const organization = await organizationService.reactivateOrganization(id);

      return res.status(200).json({
        success: true,
        message: "Organization reactivated successfully",
        data: organization,
      });
    } catch (error) {
      logger.error("Error in reactivateOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/organizations/:id
   * Delete organization (soft delete)
   */
  async deleteOrganization(req, res) {
    try {
      const { id } = req.params;

      // Only owner can delete
      if (req.tenant.roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owner can delete organization",
        });
      }

      await organizationService.deleteOrganization(id);

      return res.status(200).json({
        success: true,
        message: "Organization deleted successfully",
      });
    } catch (error) {
      logger.error("Error in deleteOrganization:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/organizations/:id/stats
   * Get organization statistics
   */
  async getOrganizationStats(req, res) {
    try {
      const { id } = req.params;

      // Verify user has access to this organization
      if (req.tenant && req.tenant.organizationId !== id) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "You don't have access to this organization",
        });
      }

      const stats = await organizationService.getOrganizationStats(id);

      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Error in getOrganizationStats:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * GET /api/organizations/:id/users
   * Get all users in organization
   */
  async getOrganizationUsers(req, res) {
    try {
      const { id } = req.params;

      // Verify user has access to this organization
      if (req.tenant && req.tenant.organizationId !== id) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
          message: "You don't have access to this organization",
        });
      }

      const users = await organizationService.getOrganizationUsers(id);

      return res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      logger.error("Error in getOrganizationUsers:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * POST /api/organizations/:id/users
   * Add user to organization
   */
  async addUser(req, res) {
    try {
      const { id } = req.params;
      const { userId, roleInOrg } = req.body;

      // Only owner and admin can add users
      if (!["owner", "admin"].includes(req.tenant.roleInOrg)) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owners and admins can add users",
        });
      }

      const user = await organizationService.addUserToOrganization(
        id,
        userId,
        roleInOrg || "member"
      );

      return res.status(200).json({
        success: true,
        message: "User added to organization successfully",
        data: user,
      });
    } catch (error) {
      logger.error("Error in addUser:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * DELETE /api/organizations/:id/users/:userId
   * Remove user from organization
   */
  async removeUser(req, res) {
    try {
      const { id, userId } = req.params;

      // Only owner and admin can remove users
      if (!["owner", "admin"].includes(req.tenant.roleInOrg)) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owners and admins can remove users",
        });
      }

      await organizationService.removeUserFromOrganization(id, userId);

      return res.status(200).json({
        success: true,
        message: "User removed from organization successfully",
      });
    } catch (error) {
      logger.error("Error in removeUser:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * PUT /api/organizations/:id/users/:userId/role
   * Update user role in organization
   */
  async updateUserRole(req, res) {
    try {
      const { id, userId } = req.params;
      const { roleInOrg } = req.body;

      // Only owner can change roles
      if (req.tenant.roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          message: "Only owner can change user roles",
        });
      }

      if (!roleInOrg) {
        return res.status(400).json({
          success: false,
          error: "Missing required field",
          message: "roleInOrg is required",
        });
      }

      const user = await organizationService.updateUserRole(id, userId, roleInOrg);

      return res.status(200).json({
        success: true,
        message: "User role updated successfully",
        data: user,
      });
    } catch (error) {
      logger.error("Error in updateUserRole:", error);
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new OrganizationController();
