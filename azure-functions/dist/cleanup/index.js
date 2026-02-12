"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cleanupTimer = async function (context, cleanupTimer) {
    const webappUrl = process.env.WEBAPP_URL || 'https://aimediatank-azure.azurewebsites.net';
    context.log('Cleanup timer trigger executed at:', new Date().toISOString());
    try {
        const response = await fetch(`${webappUrl}/api/cron/cleanup`, {
            method: 'GET',
            headers: {
                'x-cron-secret': process.env.CRON_SECRET || ''
            }
        });
        const result = await response.json();
        context.log('Cleanup result:', result);
    }
    catch (error) {
        context.log.error('Cleanup error:', error);
    }
};
exports.default = cleanupTimer;
//# sourceMappingURL=index.js.map