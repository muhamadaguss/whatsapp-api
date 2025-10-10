/**
 * Organization Service
 * 
 * Business logic for organization (tenant) management.
 * Handles CRUD operations, subscription management, and organization settings.
 */

const Organization = require("../models/organizationModel");
const Subscription = require("../models/subscriptionModel");
const SubscriptionPlan = require("../models/subscriptionPlanModel");
const User = require("../models/userModel");
const { v4: uuidv4 } = require("crypto").randomUUID ? require("crypto") : require("uuid");
const logger = require("../utils/logger");
const { Op } = require("sequelize");

class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(data, ownerId) {
    try {
      const { name, email, phone, slug, settings, timezone, currency } = data;

      // Generate slug if not provided
      const organizationSlug = slug || this.generateSlug(name);

      // Check if slug or email already exists
      const existing = await Organization.findOne({
        where: {
          [Op.or]: [{ slug: organizationSlug }, { email }],
        },
      });

      if (existing) {
        throw new Error(
          existing.slug === organizationSlug
            ? "Organization slug already exists"
            : "Organization email already exists"
        );
      }

      // Create organization with free plan and trial
      const organization = await Organization.create({
        id: uuidv4(),
        name,
        slug: organizationSlug,
        email,
        phone,
        ownerId,
        subscriptionPlan: "free",
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
        settings: settings || {},
        timezone: timezone || "Asia/Jakarta",
        currency: currency || "IDR",
        isActive: true,
      });

      // Create subscription record
      const freePlan = await SubscriptionPlan.findOne({
        where: { name: "free" },
      });

      if (freePlan) {
        await Subscription.create({
          id: uuidv4(),
          organizationId: organization.id,
          planId: freePlan.id,
          status: "active",
          startDate: new Date(),
          billingCycle: "monthly",
          amount: 0,
          currency: organization.currency,
        });
      }

      logger.info(`Organization created: ${organization.id} (${organization.name})`);

      return organization;
    } catch (error) {
      logger.error("Error creating organization:", error);
      throw error;
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(organizationId, includeOwner = false) {
    try {
      const options = {
        where: { id: organizationId },
      };

      if (includeOwner) {
        options.include = [
          {
            model: User,
            as: "owner",
            attributes: ["id", "username", "role", "isActive"],
          },
        ];
      }

      const organization = await Organization.findOne(options);

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization;
    } catch (error) {
      logger.error("Error getting organization:", error);
      throw error;
    }
  }

  /**
   * Get organization by slug
   */
  async getOrganizationBySlug(slug) {
    try {
      const organization = await Organization.findOne({
        where: { slug },
      });

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization;
    } catch (error) {
      logger.error("Error getting organization by slug:", error);
      throw error;
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(organizationId, updates) {
    try {
      const organization = await this.getOrganizationById(organizationId);

      // Fields that can be updated
      const allowedFields = [
        "name",
        "email",
        "phone",
        "settings",
        "timezone",
        "currency",
      ];

      // Only update allowed fields
      const updateData = {};
      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      });

      // Update slug if name changed
      if (updates.name && updates.name !== organization.name) {
        const newSlug = updates.slug || this.generateSlug(updates.name);
        
        // Check if new slug is available
        const slugExists = await Organization.findOne({
          where: {
            slug: newSlug,
            id: { [Op.ne]: organizationId },
          },
        });

        if (slugExists) {
          throw new Error("Slug already exists");
        }

        updateData.slug = newSlug;
      }

      await organization.update(updateData);

      logger.info(`Organization updated: ${organizationId}`);

      return organization;
    } catch (error) {
      logger.error("Error updating organization:", error);
      throw error;
    }
  }

  /**
   * Suspend organization
   */
  async suspendOrganization(organizationId, reason) {
    try {
      const organization = await this.getOrganizationById(organizationId);

      await organization.update({
        isActive: false,
        suspendedReason: reason,
        suspendedAt: new Date(),
        subscriptionStatus: "suspended",
      });

      logger.warn(`Organization suspended: ${organizationId} - Reason: ${reason}`);

      return organization;
    } catch (error) {
      logger.error("Error suspending organization:", error);
      throw error;
    }
  }

  /**
   * Reactivate organization
   */
  async reactivateOrganization(organizationId) {
    try {
      const organization = await this.getOrganizationById(organizationId);

      await organization.update({
        isActive: true,
        suspendedReason: null,
        suspendedAt: null,
        subscriptionStatus: "active",
      });

      logger.info(`Organization reactivated: ${organizationId}`);

      return organization;
    } catch (error) {
      logger.error("Error reactivating organization:", error);
      throw error;
    }
  }

  /**
   * Delete organization (soft delete)
   */
  async deleteOrganization(organizationId) {
    try {
      const organization = await this.getOrganizationById(organizationId);

      // Soft delete (paranoid is enabled in model)
      await organization.destroy();

      logger.info(`Organization deleted: ${organizationId}`);

      return { success: true, message: "Organization deleted successfully" };
    } catch (error) {
      logger.error("Error deleting organization:", error);
      throw error;
    }
  }

  /**
   * Get organization statistics
   */
  async getOrganizationStats(organizationId) {
    try {
      const User = require("../models/userModel");
      const Session = require("../models/sessionModel");
      const Template = require("../models/templateModel");
      const BlastSession = require("../models/blastSessionModel");

      // Get counts
      const [userCount, sessionCount, templateCount, blastSessionCount] = await Promise.all([
        User.count({ where: { organizationId } }),
        Session.count({ where: { organizationId } }),
        Template.count({ where: { organizationId } }),
        BlastSession.count({ where: { organization_id: organizationId } }),
      ]);

      return {
        users: userCount,
        whatsappSessions: sessionCount,
        templates: templateCount,
        blastSessions: blastSessionCount,
      };
    } catch (error) {
      logger.error("Error getting organization stats:", error);
      throw error;
    }
  }

  /**
   * Get all users in organization
   */
  async getOrganizationUsers(organizationId) {
    try {
      const users = await User.findAll({
        where: { organizationId },
        attributes: ["id", "username", "role", "roleInOrg", "isActive", "createdAt"],
        order: [["createdAt", "DESC"]],
      });

      return users;
    } catch (error) {
      logger.error("Error getting organization users:", error);
      throw error;
    }
  }

  /**
   * Add user to organization
   */
  async addUserToOrganization(organizationId, userId, roleInOrg = "member") {
    try {
      const user = await User.findByPk(userId);

      if (!user) {
        throw new Error("User not found");
      }

      if (user.organizationId) {
        throw new Error("User already belongs to an organization");
      }

      await user.update({
        organizationId,
        roleInOrg,
      });

      logger.info(`User ${userId} added to organization ${organizationId} as ${roleInOrg}`);

      return user;
    } catch (error) {
      logger.error("Error adding user to organization:", error);
      throw error;
    }
  }

  /**
   * Remove user from organization
   */
  async removeUserFromOrganization(organizationId, userId) {
    try {
      const user = await User.findOne({
        where: { id: userId, organizationId },
      });

      if (!user) {
        throw new Error("User not found in this organization");
      }

      // Check if user is owner
      const organization = await this.getOrganizationById(organizationId);
      if (organization.ownerId === userId) {
        throw new Error("Cannot remove organization owner. Transfer ownership first.");
      }

      await user.update({
        organizationId: null,
        roleInOrg: null,
      });

      logger.info(`User ${userId} removed from organization ${organizationId}`);

      return { success: true, message: "User removed from organization" };
    } catch (error) {
      logger.error("Error removing user from organization:", error);
      throw error;
    }
  }

  /**
   * Update user role in organization
   */
  async updateUserRole(organizationId, userId, newRole) {
    try {
      const validRoles = ["owner", "admin", "member", "guest"];
      if (!validRoles.includes(newRole)) {
        throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
      }

      const user = await User.findOne({
        where: { id: userId, organizationId },
      });

      if (!user) {
        throw new Error("User not found in this organization");
      }

      // If changing to owner, need to transfer ownership
      if (newRole === "owner") {
        const organization = await this.getOrganizationById(organizationId);
        await organization.update({ ownerId: userId });
        
        // Downgrade previous owner to admin
        if (organization.ownerId !== userId) {
          await User.update(
            { roleInOrg: "admin" },
            { where: { id: organization.ownerId } }
          );
        }
      }

      await user.update({ roleInOrg: newRole });

      logger.info(`User ${userId} role updated to ${newRole} in organization ${organizationId}`);

      return user;
    } catch (error) {
      logger.error("Error updating user role:", error);
      throw error;
    }
  }

  /**
   * Generate slug from name
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);
  }

  /**
   * Check if organization is active and not suspended
   */
  async isOrganizationActive(organizationId) {
    try {
      const organization = await this.getOrganizationById(organizationId);
      return organization.isActive && organization.subscriptionStatus !== "suspended";
    } catch (error) {
      return false;
    }
  }

  /**
   * Get organization with subscription details
   */
  async getOrganizationWithSubscription(organizationId) {
    try {
      const organization = await Organization.findOne({
        where: { id: organizationId },
        include: [
          {
            model: Subscription,
            as: "subscriptions",
            include: [
              {
                model: SubscriptionPlan,
                as: "plan",
              },
            ],
            where: { status: "active" },
            required: false,
          },
          {
            model: User,
            as: "owner",
            attributes: ["id", "username", "role"],
          },
        ],
      });

      if (!organization) {
        throw new Error("Organization not found");
      }

      return organization;
    } catch (error) {
      logger.error("Error getting organization with subscription:", error);
      throw error;
    }
  }
}

module.exports = new OrganizationService();
