# AiMediaTank - Azure Deployment Guide

This guide explains how to deploy AiMediaTank to Microsoft Azure.

## 📋 Prerequisites

1. **Azure Account** with active subscription
2. **Azure CLI** installed ([Download](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
3. **GitHub Account** (for CI/CD)
4. **Domain** (optional, for custom domain)

## 🏗️ Architecture

| Component | Azure Service | Tier | Est. Cost |
|-----------|---------------|------|-----------|
| Web App | App Service | B2 | $55/month |
| Database | PostgreSQL Flexible | B1ms | $15/month |
| Storage | Blob Storage | Standard | ~$5/month |
| Cron Jobs | Azure Functions | Consumption | ~$0-5/month |
| **Total** | | | **~$75-80/month** |

## 🚀 Deployment Steps

### Step 1: Login to Azure

```bash
az login
```

### Step 2: Run Deployment Script

```bash
chmod +x azure-deploy.sh
./azure-deploy.sh
```

Or manually create resources:

```bash
# Create Resource Group
az group create --name aimediatank-rg --location eastus

# Create App Service Plan
az appservice plan create \
    --name aimediatank-plan \
    --resource-group aimediatank-rg \
    --sku B2 \
    --is-linux

# Create Web App
az webapp create \
    --name aimediatank-azure \
    --resource-group aimediatank-rg \
    --plan aimediatank-plan \
    --runtime "NODE:18-lts"

# Create PostgreSQL
az postgres flexible-server create \
    --name aimediatank-db \
    --resource-group aimediatank-rg \
    --admin-user aimediatankadmin \
    --admin-password "YourSecurePassword123!" \
    --sku-name Standard_B1ms \
    --tier Burstable
```

### Step 3: Configure Environment Variables

In Azure Portal → App Service → Configuration → Application settings:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://aimediatankadmin:PASSWORD@aimediatank-db.postgres.database.azure.com:5432/aimediatank?sslmode=require` |
| `NEXTAUTH_SECRET` | Generate with: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://aimediatank-azure.azurewebsites.net` |
| `AZURE_STORAGE_CONNECTION_STRING` | From Storage Account → Access Keys |
| `AZURE_STORAGE_CONTAINER_NAME` | `media` |
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Your Stripe webhook secret |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your email |
| `SMTP_PASS` | Your app password |

### Step 4: Set Up GitHub Actions

1. Get the publish profile:
```bash
az webapp deployment list-publishing-profiles \
    --name aimediatank-azure \
    --resource-group aimediatank-rg \
    --xml > publish-profile.xml
```

2. In GitHub → Settings → Secrets → Actions, add:
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: Contents of publish-profile.xml
   - `DATABASE_URL`: Your database connection string

3. Push to main branch to trigger deployment

### Step 5: Initialize Database

After first deployment, run:

```bash
# SSH into App Service
az webapp ssh --name aimediatank-azure --resource-group aimediatank-rg

# Run Prisma migrations
npx prisma db push
```

Or use the admin endpoint:
```
https://aimediatank-azure.azurewebsites.net/api/admin/add-legal-name
```

### Step 6: Deploy Azure Functions (Cron Jobs)

```bash
cd azure-functions
npm install
npm run build

# Deploy to Azure
func azure functionapp publish aimediatank-functions
```

## 🔧 Configuration

### Custom Domain

1. Azure Portal → App Service → Custom domains
2. Add custom domain
3. Configure DNS (CNAME or A record)
4. Enable HTTPS (free managed certificate)

### Scaling

```bash
# Scale up (more resources)
az appservice plan update \
    --name aimediatank-plan \
    --resource-group aimediatank-rg \
    --sku P1V2

# Scale out (more instances)
az webapp update \
    --name aimediatank-azure \
    --resource-group aimediatank-rg \
    --number-of-workers 3
```

### Database Backup

```bash
# Enable automated backups
az postgres flexible-server update \
    --name aimediatank-db \
    --resource-group aimediatank-rg \
    --backup-retention 7
```

## 🔄 CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/azure-deploy.yml`) automatically:

1. Checks out code
2. Installs dependencies
3. Generates Prisma client
4. Builds Next.js app
5. Deploys to Azure App Service

## 📊 Monitoring

### Application Insights

1. Azure Portal → App Service → Application Insights
2. Enable Application Insights
3. View logs, metrics, and traces

### View Logs

```bash
az webapp log tail \
    --name aimediatank-azure \
    --resource-group aimediatank-rg
```

## 🛠️ Troubleshooting

### Build Fails

Check build logs:
```bash
az webapp log deployment show \
    --name aimediatank-azure \
    --resource-group aimediatank-rg
```

### Database Connection Issues

1. Ensure firewall allows Azure services
2. Verify SSL mode is set to `require`
3. Check connection string format

### Environment Variables Not Loading

1. Restart App Service after changes
2. Check Application settings in Azure Portal
3. Verify variable names match exactly

## 📁 Project Structure

```
aimediatank-azure/
├── .github/
│   └── workflows/
│       └── azure-deploy.yml    # CI/CD pipeline
├── azure-functions/            # Cron job functions
│   ├── cleanup/
│   ├── send-reminders/
│   ├── host.json
│   └── package.json
├── prisma/
│   └── schema.prisma
├── src/
│   └── ...                     # Next.js app
├── next.config.js              # Configured for standalone
├── package.json
├── server.js                   # Custom server
├── azure-deploy.sh             # Deployment script
└── AZURE-DEPLOYMENT.md         # This file
```

## 💰 Cost Optimization

1. **Use B1 tier** for development/testing (~$13/month)
2. **Reserved instances** for production (save up to 40%)
3. **Auto-shutdown** during non-business hours
4. **Blob lifecycle policies** for old media cleanup

## 🔐 Security

1. Enable **Always On** for production
2. Use **Managed Identity** for Azure services
3. Enable **HTTPS Only**
4. Configure **IP restrictions** if needed
5. Use **Azure Key Vault** for secrets (optional)

---

## Quick Reference

| Task | Command |
|------|---------|
| Deploy | `git push origin main` |
| View logs | `az webapp log tail --name aimediatank-azure --resource-group aimediatank-rg` |
| SSH | `az webapp ssh --name aimediatank-azure --resource-group aimediatank-rg` |
| Restart | `az webapp restart --name aimediatank-azure --resource-group aimediatank-rg` |
| Scale | `az appservice plan update --name aimediatank-plan --sku P1V2` |



