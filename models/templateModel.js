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

Template.belongsTo(User, { foreignKey: "userId", as: "user" });

module.exports = Template;
