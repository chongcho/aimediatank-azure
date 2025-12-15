import { AzureFunction, Context } from "@azure/functions"

const cleanupTimer: AzureFunction = async function (context: Context, cleanupTimer: any): Promise<void> {
    const webappUrl = process.env.WEBAPP_URL || 'https://aimediatank-azure.azurewebsites.net'
    
    context.log('Cleanup timer trigger executed at:', new Date().toISOString())
    
    try {
        const response = await fetch(`${webappUrl}/api/cron/cleanup`, {
            method: 'GET',
            headers: {
                'x-cron-secret': process.env.CRON_SECRET || ''
            }
        })
        
        const result = await response.json()
        context.log('Cleanup result:', result)
    } catch (error) {
        context.log.error('Cleanup error:', error)
    }
}

export default cleanupTimer

