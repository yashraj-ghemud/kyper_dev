// Node.js compatible version (converted from TypeScript)
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const httpServer = createServer();
const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// In-memory State
let apiKeys = [];
let currentKeyIndex = 0;
const agentTasks = new Map();
let currentModel = 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Prisma setup with dynamic DATABASE_URL
const databaseUrl = process.env.DATABASE_URL || 'file:../../db/custom.db';
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl
        }
    }
});

// API Key Management
async function loadApiKeys() {
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'asc' } });
    apiKeys = keys.map(k => ({
        id: k.id,
        key: k.key,
        label: k.label || `Key ${k.id.slice(-4)}`,
        isActive: k.isActive,
        isCurrent: k.isCurrent,
        requestCount: k.requestCount,
        limitReached: k.limitReached,
    }));

    const currentKey = apiKeys.find(k => k.isCurrent && k.isActive && !k.limitReached);
    if (currentKey) {
        currentKeyIndex = apiKeys.findIndex(k => k.id === currentKey.id);
    } else {
        const nextAvailable = apiKeys.find(k => k.isActive && !k.limitReached);
        if (nextAvailable) {
            currentKeyIndex = apiKeys.findIndex(k => k.id === nextAvailable.id);
        }
    }

    console.log(`Loaded ${apiKeys.length} API keys, current: ${apiKeys[currentKeyIndex]?.label || 'none'}`);
}

async function rotateKey() {
    if (apiKeys[currentKeyIndex]) {
        apiKeys[currentKeyIndex].limitReached = true;
        await prisma.apiKey.update({
            where: { id: apiKeys[currentKeyIndex].id },
            data: { limitReached: true, isCurrent: false }
        });
    }

    let nextIndex = -1;
    for (let i = 0; i < apiKeys.length; i++) {
        if (i !== currentKeyIndex && apiKeys[i].isActive && !apiKeys[i].limitReached) {
            nextIndex = i;
            break;
        }
    }

    if (nextIndex !== -1) {
        currentKeyIndex = nextIndex;
        await prisma.apiKey.update({
            where: { id: apiKeys[currentKeyIndex].id },
            data: { isCurrent: true }
        });
        console.log(`Rotated to key: ${apiKeys[currentKeyIndex].label}`);
        return apiKeys[currentKeyIndex].key;
    }

    console.log('All API keys exhausted - resetting all keys for circular rotation');
    await prisma.apiKey.updateMany({ data: { limitReached: false } });
    await loadApiKeys();
    return apiKeys[currentKeyIndex]?.key || null;
}

async function getCurrentKey() {
    if (apiKeys.length === 0) return null;
    const key = apiKeys[currentKeyIndex];
    if (!key || !key.isActive || key.limitReached) {
        return await rotateKey();
    }
    return key.key;
}

async function incrementKeyUsage() {
    if (apiKeys[currentKeyIndex]) {
        apiKeys[currentKeyIndex].requestCount++;
        await prisma.apiKey.update({
            where: { id: apiKeys[currentKeyIndex].id },
            data: {
                requestCount: { increment: 1 },
                lastUsedAt: new Date()
            }
        });
    }
}

// OpenRouter API
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are DevAgent AI, an elite autonomous web developer. Create complete, production-ready projects.

RESPONSE FORMAT - Output ONLY valid JSON (no markdown, no explanations):

{
  "intent": "create",
  "project": {"name": "project-name", "description": "What was built"},
  "files": [
    {"filename": "index.html", "content": "COMPLETE code", "language": "html"},
    {"filename": "styles.css", "content": "COMPLETE code", "language": "css"}
  ],
  "setup": {"commands": {"run": "open index.html"}},
  "features": ["Feature 1", "Feature 2"]
}

RULES:
1. Output ONLY JSON - no explanations
2. COMPLETE working code - zero placeholders
3. Modern: ES6+, CSS Grid/Flexbox, responsive`;

async function callOpenRouter(prompt, socket, taskId) {
    const maxRetries = apiKeys.length;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const apiKey = await getCurrentKey();
        if (!apiKey) {
            socket.emit('agent:error', {
                id: taskId,
                content: 'No API keys available. Please add API keys in settings.',
                timestamp: new Date().toISOString()
            });
            return '';
        }

        try {
            const response = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://kyper-dev.onrender.com',
                    'X-Title': 'Kyper Dev'
                },
                body: JSON.stringify({
                    model: currentModel,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    stream: true,
                    max_tokens: 40000,
                    temperature: 0.7
                })
            });

            if (response.status === 429 || response.status === 402) {
                console.log(`Key ${apiKeys[currentKeyIndex].label} hit limit (status ${response.status}), rotating...`);
                await rotateKey();
                retryCount++;
                continue;
            }

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`OpenRouter error (${response.status}): ${errorBody}`);
                socket.emit('agent:error', {
                    id: taskId,
                    content: `API Error (${response.status}): ${errorBody}`,
                    timestamp: new Date().toISOString()
                });
                return '';
            }

            await incrementKeyUsage();
            const fullResponse = await streamResponse(response, socket, taskId);
            return fullResponse;

        } catch (error) {
            console.error(`OpenRouter call failed: ${error.message}`);
            if (error.message.includes('rate') || error.message.includes('limit') || error.message.includes('429')) {
                await rotateKey();
                retryCount++;
                continue;
            }
            socket.emit('agent:error', {
                id: taskId,
                content: `Network error: ${error.message}`,
                timestamp: new Date().toISOString()
            });
            return '';
        }
    }

    socket.emit('agent:error', {
        id: taskId,
        content: 'All API keys exhausted. Please add more keys or wait for limits to reset.',
        timestamp: new Date().toISOString()
    });
    return '';
}

async function streamResponse(response, socket, taskId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            fullResponse += content;
                            socket.emit('agent:stream', {
                                id: taskId,
                                chunk: content,
                                timestamp: new Date().toISOString()
                            });
                        }
                    } catch {
                        // Skip malformed chunks
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullResponse;
}

// File Parser
function parseAgentOutput(output) {
    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const thinking = parsed.thinking || '';
            const files = [];

            if (parsed.files && Array.isArray(parsed.files)) {
                for (const file of parsed.files) {
                    files.push({
                        filename: file.filename,
                        content: file.content,
                        language: file.language || getLanguageFromFilename(file.filename)
                    });
                }
            }

            let summary = parsed.summary || '';
            if (parsed.project) {
                summary = `Project: ${parsed.project.name}\n${parsed.project.description}\n\n` + summary;
            }
            if (parsed.setup && parsed.setup.commands) {
                summary += `\n\n🚀 Run Command: ${parsed.setup.commands.run || 'open index.html'}`;
            }

            return { thinking, files, summary };
        }
    } catch (e) {
        console.log('JSON parsing failed');
    }

    return { thinking: '', files: [], summary: '' };
}

function getLanguageFromFilename(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap = {
        'html': 'html', 'htm': 'html', 'css': 'css',
        'js': 'javascript', 'ts': 'typescript', 'json': 'json'
    };
    return langMap[ext] || 'text';
}

// Save Project
async function saveProject(name, files, description) {
    const project = await prisma.project.create({
        data: {
            name,
            description: description || `Auto-generated: ${name}`,
            status: 'completed',
            files: {
                create: files.map(f => ({
                    filename: f.filename,
                    content: f.content,
                    language: f.language,
                }))
            }
        },
        include: { files: true }
    });
    return project;
}

// Socket.IO Events
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.emit('state:init', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        currentModel,
        keyCount: apiKeys.length,
        activeKeyCount: apiKeys.filter(k => k.isActive && !k.limitReached).length,
    });

    // Task execution
    socket.on('task:start', async (data) => {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.log(`New task: ${data.prompt}`);

        const dbTask = await prisma.agentTask.create({
            data: {
                taskPrompt: data.prompt,
                status: 'running',
                modelUsed: currentModel,
            }
        });

        socket.emit('task:started', {
            id: taskId,
            dbId: dbTask.id,
            prompt: data.prompt,
            timestamp: new Date().toISOString()
        });

        const fullResponse = await callOpenRouter(data.prompt, socket, taskId);

        if (fullResponse) {
            const parsed = parseAgentOutput(fullResponse);

            if (parsed.thinking) {
                socket.emit('agent:thinking', {
                    id: taskId,
                    content: parsed.thinking,
                    timestamp: new Date().toISOString()
                });
            }

            for (const file of parsed.files) {
                socket.emit('agent:file', {
                    id: taskId,
                    filename: file.filename,
                    content: file.content,
                    language: file.language,
                    timestamp: new Date().toISOString()
                });
            }

            if (parsed.summary) {
                socket.emit('agent:summary', {
                    id: taskId,
                    content: parsed.summary,
                    timestamp: new Date().toISOString()
                });
            }

            if (parsed.files.length > 0) {
                const projectName = data.projectName || `Project_${Date.now()}`;
                const project = await saveProject(projectName, parsed.files, parsed.summary);

                const projectPath = path.join(__dirname, '../../generated-projects', projectName);

                try {
                    if (!fs.existsSync(projectPath)) {
                        fs.mkdirSync(projectPath, { recursive: true });
                    }

                    for (const file of parsed.files) {
                        const filePath = path.join(projectPath, file.filename);
                        fs.writeFileSync(filePath, file.content, 'utf8');
                        console.log(`✅ Created: ${file.filename}`);
                    }

                    socket.emit('project:created', {
                        id: taskId,
                        projectId: project.id,
                        projectName: project.name,
                        projectPath: projectPath,
                        files: parsed.files,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    console.error('File creation error:', error);
                }
            }

            await prisma.agentTask.update({
                where: { id: dbTask.id },
                data: {
                    agentOutput: fullResponse,
                    status: 'completed',
                }
            });
        }

        socket.emit('task:complete', {
            id: taskId,
            timestamp: new Date().toISOString()
        });
    });

    // API Key management
    socket.on('keys:add', async (data) => {
        try {
            const newKey = await prisma.apiKey.create({
                data: {
                    key: data.key,
                    label: data.label || `Key ${data.key.slice(-4)}`,
                    isActive: true,
                }
            });
            await loadApiKeys();
            socket.emit('keys:updated', {
                apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
                currentKeyIndex,
                success: true,
            });
        } catch (error) {
            socket.emit('keys:error', { message: error.message });
        }
    });

    socket.on('keys:remove', async (data) => {
        try {
            await prisma.apiKey.delete({ where: { id: data.id } });
            await loadApiKeys();
            socket.emit('keys:updated', {
                apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
                currentKeyIndex,
                success: true,
            });
        } catch (error) {
            socket.emit('keys:error', { message: error.message });
        }
    });

    socket.on('keys:toggle', async (data) => {
        try {
            await prisma.apiKey.update({
                where: { id: data.id },
                data: { isActive: data.active }
            });
            await loadApiKeys();
            socket.emit('keys:updated', {
                apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
                currentKeyIndex,
                success: true,
            });
        } catch (error) {
            socket.emit('keys:error', { message: error.message });
        }
    });

    socket.on('keys:reset', async () => {
        try {
            await prisma.apiKey.updateMany({ data: { limitReached: false } });
            await loadApiKeys();
            socket.emit('keys:updated', {
                apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
                currentKeyIndex,
                success: true,
            });
        } catch (error) {
            socket.emit('keys:error', { message: error.message });
        }
    });

    socket.on('model:set', async (data) => {
        currentModel = data.model;
        socket.emit('model:updated', { model: currentModel });
    });

    socket.on('projects:list', async () => {
        try {
            const projects = await prisma.project.findMany({
                orderBy: { createdAt: 'desc' },
                include: { files: true }
            });
            socket.emit('projects:list', { projects });
        } catch (error) {
            socket.emit('projects:error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Start server
const PORT = process.env.PORT || 3003;

async function startServer() {
    try {
        await loadApiKeys();
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Agent Service running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
