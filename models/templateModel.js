const { DataTypes } = require("sequelize");
const sequelize = require("./db");
const User = require("./userModel");

const Template = sequelize.define(
  "Template",
  {
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: "id",
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "text",
    }, // e.g., 'text', 'image', 'video'
  },
  {
    timestamps: true,
    tableName: "templates",
  }
);

// Association function for relationships
Template.associate = function(models) {
  Template.belongsTo(models.User, { foreignKey: "userId", as: "user" });
};

module.exports = Template;
