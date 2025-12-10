const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const AutoReplyRule = sequelize.define(
  "AutoReplyRule",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "PAID, CANT_PAY, NEGOTIATE, COMPLAINT, DEFAULT",
    },
    keywords: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      comment: "Array of keywords for detection",
    },
    responseTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "response_template",
    },
    notifyCollector: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "notify_collector",
      comment: "Send notification to collector when this rule is triggered",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: "is_active",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by",
    },
  },
  {
    timestamps: true,
    tableName: "auto_reply_rules",
  }
);

AutoReplyRule.associate = function (models) {
  AutoReplyRule.belongsTo(models.User, {
    foreignKey: "createdBy",
    as: "creator",
  });
};

module.exports = AutoReplyRule;
