import { AzureFunction, Context } from "@azure/functions"

const processVideos: AzureFunction = async function (context: Context, processTimer: any): Promise<void> {
    const webappUrl = process.env.WEBAPP_URL || 'https://aimediatank-azure.azurewebsites.net'

    context.log('Process videos timer trigger executed at:', new Date().toISOString())

    try {
        const response = await fetch(`${webappUrl}/api/cron/process-videos`, {
            method: 'GET',
            headers: {
                'x-cron-secret': process.env.CRON_SECRET || ''
            }
        })

        const result = await response.json()
        context.log('Process videos result:', JSON.stringify(result))

        if (result.status === 'processed') {
            context.log(`✅ Processed video: ${result.title} (${result.mediaId})`)
        } else if (result.status === 'busy') {
            context.log('⏳ Another video is still processing, will retry next tick')
        } else if (result.status === 'idle') {
            context.log('💤 No pending videos')
        }
    } catch (error) {
        context.log.error('Process videos error:', error)
    }
}

export default processVideos
