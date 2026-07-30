#!/bin/bash
# Render startup script for agent service

echo "🤖 Starting Agent Service on Render..."

# Navigate to agent service directory
cd mini-services/agent-service

# Create db directory if it doesn't exist
mkdir -p ../../db

# Generate Prisma client
echo "📦 Generating Prisma client..."
cd ../..
npx prisma generate

# Start agent service
echo "✅ Starting agent service on port ${PORT}..."
cd mini-services/agent-service
exec node index.js
