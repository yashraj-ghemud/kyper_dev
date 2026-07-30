#!/bin/bash
# DevAgent AI - Startup Script
# This script starts all services needed for DevAgent AI

echo "🤖 Starting DevAgent AI..."

# Start the agent service (Socket.IO on port 3003)
echo "Starting Agent Service on port 3003..."
cd /home/z/my-project/mini-services/agent-service
bun run dev &
AGENT_PID=$!
echo "Agent Service PID: $AGENT_PID"

# Start the Next.js frontend (port 3000)
echo "Starting Next.js Frontend on port 3000..."
cd /home/z/my-project
bun run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo "✅ DevAgent AI is running!"
echo "   Frontend: http://localhost:3000"
echo "   Agent Service: ws://localhost:3003"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $AGENT_PID $FRONTEND_PID
