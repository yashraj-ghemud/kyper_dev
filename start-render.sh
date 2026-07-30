#!/bin/bash

# Startup script for Render

echo "🚀 Starting Kyper Dev..."

# Ensure database directory exists
mkdir -p db

# Check if database file exists
if [ ! -f "db/custom.db" ]; then
    echo "📦 Database not found, creating..."
    npm run db:push
fi

# Start the application
echo "✨ Starting server..."
node server.js
