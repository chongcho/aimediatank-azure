#!/bin/bash

# ============================================
# Azure Deployment Script for AiMediaTank
# ============================================

# Configuration
RESOURCE_GROUP="aimediatank-rg"
LOCATION="eastus"
APP_NAME="aimediatank-azure"
APP_PLAN="aimediatank-plan"
DB_SERVER="aimediatank-db"
DB_NAME="aimediatank"
DB_ADMIN="aimediatankadmin"
STORAGE_ACCOUNT="aimediatankstorage"
FUNCTIONS_APP="aimediatank-functions"

echo "============================================"
echo "AiMediaTank Azure Deployment"
echo "============================================"

# Check if logged in
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Please login to Azure first:"
    az login
fi

echo ""
echo "Step 1: Creating Resource Group..."
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION

echo ""
echo "Step 2: Creating App Service Plan (Linux, B2)..."
az appservice plan create \
    --name $APP_PLAN \
    --resource-group $RESOURCE_GROUP \
    --sku B2 \
    --is-linux

echo ""
echo "Step 3: Creating Web App..."
az webapp create \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --plan $APP_PLAN \
    --runtime "NODE:18-lts"

echo ""
echo "Step 4: Creating PostgreSQL Flexible Server..."
echo "Please enter a secure password for the database admin:"
read -s DB_PASSWORD
az postgres flexible-server create \
    --name $DB_SERVER \
    --resource-group $RESOURCE_GROUP \
    --admin-user $DB_ADMIN \
    --admin-password "$DB_PASSWORD" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 32 \
    --version 15

echo ""
echo "Step 5: Creating Database..."
az postgres flexible-server db create \
    --resource-group $RESOURCE_GROUP \
    --server-name $DB_SERVER \
    --database-name $DB_NAME

echo ""
echo "Step 6: Configuring Firewall for Azure Services..."
az postgres flexible-server firewall-rule create \
    --resource-group $RESOURCE_GROUP \
    --name $DB_SERVER \
    --rule-name AllowAzureServices \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0

echo ""
echo "Step 7: Creating Storage Account (if not exists)..."
az storage account create \
    --name $STORAGE_ACCOUNT \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --sku Standard_LRS \
    --kind StorageV2 \
    2>/dev/null || echo "Storage account may already exist"

echo ""
echo "Step 8: Creating Azure Functions App..."
az functionapp create \
    --name $FUNCTIONS_APP \
    --resource-group $RESOURCE_GROUP \
    --storage-account $STORAGE_ACCOUNT \
    --consumption-plan-location $LOCATION \
    --runtime node \
    --runtime-version 18 \
    --functions-version 4

echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Next Steps:"
echo ""
echo "1. Set Environment Variables in Azure Portal:"
echo "   Go to: App Service -> Configuration -> Application settings"
echo ""
echo "   DATABASE_URL=postgresql://$DB_ADMIN:YOUR_PASSWORD@$DB_SERVER.postgres.database.azure.com:5432/$DB_NAME?sslmode=require"
echo "   NEXTAUTH_SECRET=<generate-a-secret>"
echo "   NEXTAUTH_URL=https://$APP_NAME.azurewebsites.net"
echo "   AZURE_STORAGE_CONNECTION_STRING=<your-connection-string>"
echo "   AZURE_STORAGE_CONTAINER_NAME=media"
echo "   STRIPE_SECRET_KEY=<your-stripe-key>"
echo "   STRIPE_WEBHOOK_SECRET=<your-webhook-secret>"
echo "   SMTP_HOST=smtp.gmail.com"
echo "   SMTP_PORT=587"
echo "   SMTP_USER=<your-email>"
echo "   SMTP_PASS=<your-app-password>"
echo ""
echo "2. Get Web App Publish Profile:"
echo "   az webapp deployment list-publishing-profiles --name $APP_NAME --resource-group $RESOURCE_GROUP --xml"
echo ""
echo "3. Add the publish profile as GitHub secret: AZURE_WEBAPP_PUBLISH_PROFILE"
echo ""
echo "4. Push code to GitHub to trigger deployment"
echo ""




