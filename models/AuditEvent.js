const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AuditEvent extends Model {}

  AuditEvent.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AuditEvent',
    tableName: 'audit_events',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
    underscored: true
  });

  return AuditEvent;
};