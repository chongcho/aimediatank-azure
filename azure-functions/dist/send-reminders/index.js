"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reminderTimer = async function (context, reminderTimer) {
    const webappUrl = process.env.WEBAPP_URL || 'https://aimediatank-azure.azurewebsites.net';
    context.log('Send reminders timer trigger executed at:', new Date().toISOString());
    try {
        const response = await fetch(`${webappUrl}/api/cron/send-reminders`, {
            method: 'GET',
            headers: {
                'x-cron-secret': process.env.CRON_SECRET || ''
            }
        });
        const result = await response.json();
        context.log('Send reminders result:', result);
    }
    catch (error) {
        context.log.error('Send reminders error:', error);
    }
};
exports.default = reminderTimer;
//# sourceMappingURL=index.js.map