const { DataTypes } = require("sequelize");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add messageType column
    await queryInterface.addColumn("chat_messages", "messageType", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "text",
    });

    // Add mediaUrl column
    await queryInterface.addColumn("chat_messages", "mediaUrl", {
      type: DataTypes.TEXT,
      allowNull: true,
    });

    console.log(
      "✅ Added messageType and mediaUrl columns to chat_messages table"
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns in reverse order
    await queryInterface.removeColumn("chat_messages", "mediaUrl");
    await queryInterface.removeColumn("chat_messages", "messageType");

    console.log(
      "✅ Removed messageType and mediaUrl columns from chat_messages table"
    );
  },
};
