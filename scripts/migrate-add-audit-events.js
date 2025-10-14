const { DataTypes } = require('sequelize');
const { sequelize } = require('../models');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.createTable('AuditEvents', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      eventType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE
      }
    });
    console.log('Migration successful: AuditEvents table created.');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.dropTable('AuditEvents');
    console.log('Migration reverted: AuditEvents table dropped.');
  } catch (error) {
    console.error('Reverting migration failed:', error);
  }
}

// Check command line arguments to decide whether to migrate up or down
if (process.argv.includes('down')) {
  down().finally(() => sequelize.close());
} else {
  up().finally(() => sequelize.close());
}
