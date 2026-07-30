# DevAgent AI - Autonomous Coding Agent

## Overview

DevAgent AI is an autonomous coding agent website similar to Devin AI. It features a desktop-like web interface where you can give coding tasks, and the AI agent will autonomously write code, create files, and provide a live preview of the built project.

## Architecture

- **Frontend**: Next.js 16 with TypeScript, Tailwind CSS, and shadcn/ui
- **Agent Backend**: Socket.IO mini-service (port 3003) that manages the agentic loop
- **AI Brain**: OpenRouter API with configurable models (default: neotronmon-3-ultra)
- **API Key Rotation**: Smart automatic rotation when one key reaches its rate limit
- **Database**: SQLite via Prisma ORM for storing API keys, projects, and task history

## Features

1. **Agentic Coding**: Tell DevAgent what to build, and it creates complete working projects
2. **Live Preview**: Real-time iframe preview of generated HTML/CSS/JS projects
3. **File Management**: View all generated files in a code editor panel
4. **Smart Key Rotation**: Add 4-5 OpenRouter API keys; auto-switches when limits are reached
5. **Terminal Logs**: Real-time terminal showing agent actions
6. **Project History**: All generated projects are saved and can be revisited
7. **Streaming Output**: Agent responses stream in real-time
8. **Configurable Model**: Change the AI model (brain) via settings

## Quick Start

### 1. Extract and Install Dependencies

```bash
# Extract the zip
unzip DevAgent-AI.zip -d devagent-ai
cd devagent-ai

# Install main project dependencies
bun install

# Install agent service dependencies
cd mini-services/agent-service
bun install
cd ../..

# Generate Prisma client and push schema
bun run db:push
bun run db:generate
```

### 2. Start All Services

```bash
# Option A: Use the startup script
./start.sh

# Option B: Start services individually
# Start agent service
cd mini-services/agent-service && bun run dev &

# Start frontend (in separate terminal or background)
cd /home/z/my-project && bun run dev
```

### 2. Open the Website

Navigate to `http://localhost:3000` in your browser.

### 3. Add API Keys

1. Click the **Settings** button in the top bar
2. Add your OpenRouter API keys (you can add multiple for rotation)
3. Get API keys from: https://openrouter.ai/settings/keys

### 4. Give a Task

Type a task in the chat input, e.g.:
- "Create a snake game"
- "Build a todo app with dark theme"
- "Make a calculator website"

The agent will:
1. Think about the approach
2. Generate code files
3. Create a live preview
4. Save the project

### 5. View the Preview

Click the **Preview** tab to see the generated project running live in an iframe.

## Configuration

### Model Selection

In Settings, you can change the AI model (the "brain"). Available models include:
- `neotronmon-3-ultra` (default)
- `openai/gpt-4o`
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash-001`
- `meta-llama/llama-3.1-405b-instruct`

Or enter any OpenRouter-compatible model ID.

### API Key Rotation

When you add multiple API keys:
- DevAgent uses one key at a time (marked as "Active")
- When the active key hits its rate limit (429 error), it automatically switches to the next key
- When all keys are exhausted, limits reset automatically (circular rotation)
- You can manually reset limits via Settings

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main UI (desktop-like interface)
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Global styles
│   ├── store/
│   │   └── agent-store.ts    # Zustand state management
│   ├── components/ui/        # shadcn/ui components
│   └── lib/
│       ├── db.ts             # Prisma client
│       └── utils.ts          # Utilities
├── mini-services/
│   └── agent-service/
│       ├── index.ts           # Socket.IO agent service (OpenRouter + key rotation)
│       └── package.json
├── prisma/
│   └── schema.prisma         # Database schema
├── start.sh                  # Startup script
├── package.json              # Main project dependencies
└── Caddyfile                 # Gateway configuration
```

## How It Works

1. **User Input**: User types a task in the chat
2. **Socket.IO**: Frontend sends `task:start` event to agent service
3. **Agent Loop**: Service calls OpenRouter API with agentic system prompt
4. **Streaming**: Response streams back to frontend via Socket.IO
5. **File Parsing**: Agent output is parsed to extract individual files
6. **Preview**: HTML/CSS/JS files are combined and rendered in an iframe
7. **Storage**: Project and files are saved to SQLite database

## Requirements

- Node.js / Bun runtime
- OpenRouter API key(s)
- Internet connection (for API calls)
