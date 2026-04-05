"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Calls Next.js /api/cron/upload-live-notify (short) so deferred upload emails run even when
 * process-videos is blocked on FFmpeg for many minutes.
 */
const uploadLiveNotify = async function (context) {
    const webappUrl = process.env.WEBAPP_URL || "https://aimediatank-azure.azurewebsites.net";
    context.log("Upload live notify timer at:", new Date().toISOString());
    try {
        const response = await fetch(`${webappUrl}/api/cron/upload-live-notify`, {
            method: "GET",
            headers: {
                "x-cron-secret": process.env.CRON_SECRET || "",
            },
        });
        const result = await response.json();
        context.log("Upload live notify result:", JSON.stringify(result));
    }
    catch (error) {
        context.log.error("Upload live notify error:", error);
    }
};
exports.default = uploadLiveNotify;
//# sourceMappingURL=index.js.map