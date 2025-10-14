const { AuditEvent } = require('../models');

/**
 * Asynchronously logs an audit event.
 * This function runs in the background and does not block the main request flow.
 * Errors are logged to the console but not thrown, ensuring logging failures don't crash the application.
 * @param {number} userId - The ID of the user performing the action.
 * @param {string} eventType - The type of event (e.g., 'CREATE_CATEGORY').
 * @param {object} [details={}] - A JSON object with specific details about the event.
 */
const logEvent = (userId, eventType, details = {}) => {
    AuditEvent.create({ userId, eventType, details })
        .catch(err => {
            console.error('Failed to log audit event:', err);
        });
};

module.exports = { logEvent };
