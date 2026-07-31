// Simple Agent Service - NO DATABASE REQUIRED!
const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// IN-MEMORY STORAGE (No database needed!)
let apiKeys = [];
let projects = [];
let currentKeyIndex = 0;
let currentModel = 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Helper Functions
function generateId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function getCurrentKey() {
    const activeKeys = apiKeys.filter(k => k.isActive && !k.limitReached);
    if (activeKeys.length === 0) return null;

    if (currentKeyIndex >= activeKeys.length) currentKeyIndex = 0;
    return activeKeys[currentKeyIndex]?.key;
}

async function rotateKey() {
    if (apiKeys[currentKeyIndex]) {
        apiKeys[currentKeyIndex].limitReached = true;
    }

    currentKeyIndex++;
    const activeKeys = apiKeys.filter(k => k.isActive && !k.limitReached);

    if (activeKeys.length === 0) {
        console.log('♻️ All keys exhausted - resetting');
        apiKeys.forEach(k => k.limitReached = false);
        currentKeyIndex = 0;
    }

    return getCurrentKey();
}

// OpenRouter API
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SYSTEM_PROMPT = `You are DevAgent AI. Create complete code.

Output ONLY JSON:
{
  "files": [
    {"filename": "index.html", "content": "COMPLETE code", "language": "html"}
  ],
  "summary": "What you built"
}`;

async function callOpenRouter(prompt, socket, taskId) {
    const apiKey = await getCurrentKey();
    if (!apiKey) {
        socket.emit('agent:error', {
            id: taskId,
            content: 'No API keys available. Add keys in settings.',
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
            console.log(`⚠️ Key limit, rotating...`);
            await rotateKey();
            return callOpenRouter(prompt, socket, taskId);
        }

        if (!response.ok) {
            socket.emit('agent:error', {
                id: taskId,
                content: `API Error (${response.status})`,
                timestamp: new Date().toISOString()
            });
            return '';
        }

        return await streamResponse(response, socket, taskId);

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        socket.emit('agent:error', {
            id: taskId,
            content: `Network error: ${error.message}`,
            timestamp: new Date().toISOString()
        });
        return '';
    }
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
            return {
                files: parsed.files || [],
                summary: parsed.summary || 'Generated code'
            };
        }
    } catch (e) { }
    return { files: [], summary: '' };
}

// Socket.IO Events
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Send current state
    socket.emit('state:init', {
        apiKeys: apiKeys.map(k => ({
            ...k,
            key: k.key.slice(0, 8) + '...'
        })),
        currentKeyIndex,
        currentModel,
        keyCount: apiKeys.length,
        activeKeyCount: apiKeys.filter(k => k.isActive && !k.limitReached).length,
    });

    // Handle task
    socket.on('task:start', async (data) => {
        const taskId = generateId();
        console.log(`🚀 Task: ${data.prompt}`);

        socket.emit('task:started', {
            id: taskId,
            prompt: data.prompt,
            timestamp: new Date().toISOString()
        });

        const fullResponse = await callOpenRouter(data.prompt, socket, taskId);

        if (fullResponse) {
            const parsed = parseAgentOutput(fullResponse);

            // Emit files
            for (const file of parsed.files) {
                socket.emit('agent:file', {
                    id: taskId,
                    filename: file.filename,
                    content: file.content,
                    language: file.language || 'html',
                    timestamp: new Date().toISOString()
                });
            }

            // Save project in memory
            if (parsed.files.length > 0) {
                const project = {
                    id: generateId(),
                    name: data.projectName || `Project_${Date.now()}`,
                    files: parsed.files,
                    createdAt: new Date().toISOString()
                };
                projects.push(project);

                socket.emit('agent:summary', {
                    id: taskId,
                    content: parsed.summary,
                    timestamp: new Date().toISOString()
                });

                socket.emit('project:created', {
                    id: taskId,
                    projectId: project.id,
                    projectName: project.name,
                    files: parsed.files,
                    timestamp: new Date().toISOString()
                });
            }
        }

        socket.emit('task:complete', {
            id: taskId,
            timestamp: new Date().toISOString()
        });
    });

    // API Key Management
    socket.on('keys:add', (data) => {
        const newKey = {
            id: generateId(),
            key: data.key,
            label: data.label || `Key ${data.key.slice(-4)}`,
            isActive: true,
            limitReached: false,
            requestCount: 0
        };
        apiKeys.push(newKey);

        socket.emit('keys:updated', {
            apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
            currentKeyIndex,
            success: true,
        });
        console.log(`✅ Added key: ${newKey.label}`);
    });

    socket.on('keys:remove', (data) => {
        apiKeys = apiKeys.filter(k => k.id !== data.id);
        socket.emit('keys:updated', {
            apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
            currentKeyIndex,
            success: true,
        });
    });

    socket.on('keys:toggle', (data) => {
        const key = apiKeys.find(k => k.id === data.id);
        if (key) key.isActive = data.active;

        socket.emit('keys:updated', {
            apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
            currentKeyIndex,
            success: true,
        });
    });

    socket.on('keys:reset', () => {
        apiKeys.forEach(k => k.limitReached = false);
        currentKeyIndex = 0;

        socket.emit('keys:updated', {
            apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
            currentKeyIndex,
            success: true,
        });
    });

    socket.on('model:set', (data) => {
        currentModel = data.model;
        socket.emit('model:updated', { model: currentModel });
    });

    socket.on('projects:list', () => {
        socket.emit('projects:list', { projects });
    });

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });
});

// Start Server
const PORT = process.env.PORT || 3003;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Agent Service (No DB) running on port ${PORT}`);
    console.log(`💾 Using in-memory storage`);
});
