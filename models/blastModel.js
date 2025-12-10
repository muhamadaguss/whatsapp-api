const { DataTypes } = require("sequelize");
const sequelize = require("./db");
const User = require("./userModel");
const Blast = sequelize.define(
  "Blast",
  {
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: "id",
      },
    },
    campaignId: {
      type: DataTypes.STRING,
    },
    messageTemplate: { type: DataTypes.TEXT, allowNull: false },
    totalRecipients: { type: DataTypes.INTEGER, defaultValue: 0 },
    sentCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING, defaultValue: "processing" },
    autoReplyEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "auto_reply_enabled",
    },
    autoReplyRules: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      field: "auto_reply_rules",
    },
  },
  {
    timestamps: true,
    tableName: "blasts",
  }
);
Blast.associate = function (models) {
  Blast.belongsTo(models.User, { foreignKey: "userId", as: "user" });
};
module.exports = Blast;
