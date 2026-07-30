#!/bin/bash

# Build script for Render deployment

echo "🔨 Starting build process..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
npm run db:generate

# Build Next.js
echo "⚡ Building Next.js application..."
npm run build

echo "✅ Build complete!"
