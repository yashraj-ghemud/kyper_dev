// Agent Service - Root Level (Production Ready)
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
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// State
let apiKeys = [];
let currentKeyIndex = 0;
const agentTasks = new Map();
let currentModel = 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Prisma setup with PostgreSQL
const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/kyper_dev';
const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } }
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

    console.log(`✅ Loaded ${apiKeys.length} API keys`);
}

async function getCurrentKey() {
    if (apiKeys.length === 0) return null;
    const key = apiKeys[currentKeyIndex];
    if (!key || !key.isActive || key.limitReached) {
        return await rotateKey();
    }
    return key.key;
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
        console.log(`🔄 Rotated to key: ${apiKeys[currentKeyIndex].label}`);
        return apiKeys[currentKeyIndex].key;
    }

    console.log('♻️ All keys exhausted - resetting');
    await prisma.apiKey.updateMany({ data: { limitReached: false } });
    await loadApiKeys();
    return apiKeys[currentKeyIndex]?.key || null;
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

// OpenRouter
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SYSTEM_PROMPT = `You are DevAgent AI. Create complete, production-ready code.

Output ONLY valid JSON:
{
  "intent": "create",
  "project": {"name": "project-name", "description": "desc"},
  "files": [
    {"filename": "index.html", "content": "COMPLETE code", "language": "html"}
  ],
  "features": ["Feature 1"]
}

RULES: Output ONLY JSON. COMPLETE code. No placeholders.`;

async function callOpenRouter(prompt, socket, taskId) {
    const maxRetries = apiKeys.length || 1;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const apiKey = await getCurrentKey();
        if (!apiKey) {
            socket.emit('agent:error', {
                id: taskId,
                content: 'No API keys. Add keys in settings.',
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
                console.log(`⚠️ Key limit hit, rotating...`);
                await rotateKey();
                retryCount++;
                continue;
            }

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`❌ API Error (${response.status}): ${errorBody}`);
                socket.emit('agent:error', {
                    id: taskId,
                    content: `API Error (${response.status})`,
                    timestamp: new Date().toISOString()
                });
                return '';
            }

            await incrementKeyUsage();
            return await streamResponse(response, socket, taskId);

        } catch (error) {
            console.error(`❌ Network error: ${error.message}`);
            if (error.message.includes('rate') || error.message.includes('429')) {
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
        content: 'All keys exhausted.',
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
                    } catch { }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return fullResponse;
}

function parseAgentOutput(output) {
    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const files = parsed.files || [];
            return { thinking: '', files, summary: parsed.project?.description || '' };
        }
    } catch (e) { }
    return { thinking: '', files: [], summary: '' };
}

function getLanguageFromFilename(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map = { 'html': 'html', 'css': 'css', 'js': 'javascript', 'json': 'json' };
    return map[ext] || 'text';
}

async function saveProject(name, files, description) {
    const project = await prisma.project.create({
        data: {
            name,
            description: description || `Generated: ${name}`,
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

// Socket.IO
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    socket.emit('state:init', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        currentModel,
        keyCount: apiKeys.length,
        activeKeyCount: apiKeys.filter(k => k.isActive && !k.limitReached).length,
    });

    socket.on('task:start', async (data) => {
        const taskId = `task_${Date.now()}`;
        console.log(`🚀 New task: ${data.prompt}`);

        const dbTask = await prisma.agentTask.create({
            data: { taskPrompt: data.prompt, status: 'running', modelUsed: currentModel }
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

                socket.emit('project:created', {
                    id: taskId,
                    projectId: project.id,
                    projectName: project.name,
                    files: parsed.files,
                    timestamp: new Date().toISOString()
                });
            }

            await prisma.agentTask.update({
                where: { id: dbTask.id },
                data: { agentOutput: fullResponse, status: 'completed' }
            });
        }

        socket.emit('task:complete', {
            id: taskId,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('keys:add', async (data) => {
        try {
            await prisma.apiKey.create({
                data: { key: data.key, label: data.label || `Key ${data.key.slice(-4)}`, isActive: true }
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

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });
});

// Start
const PORT = process.env.PORT || 3003;

async function startServer() {
    try {
        await loadApiKeys();
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Agent Service running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

startServer();
