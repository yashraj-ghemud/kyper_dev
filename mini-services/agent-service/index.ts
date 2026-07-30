import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─── Types ────────────────────────────────────────────────────
interface ApiKeyEntry {
  id: string
  key: string
  label: string
  isActive: boolean
  isCurrent: boolean
  requestCount: number
  limitReached: boolean
}

interface ProjectFile {
  filename: string
  content: string
  language: string
}

interface AgentMessage {
  id: string
  type: 'user' | 'agent' | 'system' | 'file' | 'error' | 'thinking'
  content: string
  timestamp: string
  filename?: string
  language?: string
}

// ─── In-memory State ──────────────────────────────────────────
let apiKeys: ApiKeyEntry[] = []
let currentKeyIndex = 0
const agentTasks: Map<string, { prompt: string; status: string; messages: AgentMessage[] }> = new Map()
let currentModel = 'nvidia/nemotron-3-ultra-550b-a55b:free' // Default model - user can change in settings

// ─── Prisma Integration ──────────────────────────────────────
import { PrismaClient } from '../../node_modules/@prisma/client'
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:/home/z/my-project/db/custom.db'
    }
  }
})

// ─── API Key Management ──────────────────────────────────────
async function loadApiKeys() {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: 'asc' } })
  apiKeys = keys.map(k => ({
    id: k.id,
    key: k.key,
    label: k.label || `Key ${k.id.slice(-4)}`,
    isActive: k.isActive,
    isCurrent: k.isCurrent,
    requestCount: k.requestCount,
    limitReached: k.limitReached,
  }))

  // Set current key index
  const currentKey = apiKeys.find(k => k.isCurrent && k.isActive && !k.limitReached)
  if (currentKey) {
    currentKeyIndex = apiKeys.findIndex(k => k.id === currentKey.id)
  } else {
    // Find first active key that hasn't reached limit
    const nextAvailable = apiKeys.find(k => k.isActive && !k.limitReached)
    if (nextAvailable) {
      currentKeyIndex = apiKeys.findIndex(k => k.id === nextAvailable.id)
    }
  }

  console.log(`Loaded ${apiKeys.length} API keys, current: ${apiKeys[currentKeyIndex]?.label || 'none'}`)
}

async function rotateKey() {
  // Mark current key as limit reached
  if (apiKeys[currentKeyIndex]) {
    apiKeys[currentKeyIndex].limitReached = true
    await prisma.apiKey.update({
      where: { id: apiKeys[currentKeyIndex].id },
      data: { limitReached: true, isCurrent: false }
    })
  }

  // Find next available key
  let nextIndex = -1
  for (let i = 0; i < apiKeys.length; i++) {
    if (i !== currentKeyIndex && apiKeys[i].isActive && !apiKeys[i].limitReached) {
      nextIndex = i
      break
    }
  }

  if (nextIndex !== -1) {
    currentKeyIndex = nextIndex
    await prisma.apiKey.update({
      where: { id: apiKeys[currentKeyIndex].id },
      data: { isCurrent: true }
    })
    console.log(`Rotated to key: ${apiKeys[currentKeyIndex].label}`)
    return apiKeys[currentKeyIndex].key
  }

  // All keys exhausted - reset all and start over (circular rotation)
  console.log('All API keys exhausted - resetting all keys for circular rotation')
  await prisma.apiKey.updateMany({ data: { limitReached: false } })
  await loadApiKeys()
  return apiKeys[currentKeyIndex]?.key || null
}

async function getCurrentKey(): string | null {
  if (apiKeys.length === 0) return null
  const key = apiKeys[currentKeyIndex]
  if (!key || !key.isActive || key.limitReached) {
    return await rotateKey()
  }
  return key.key
}

async function incrementKeyUsage() {
  if (apiKeys[currentKeyIndex]) {
    apiKeys[currentKeyIndex].requestCount++
    await prisma.apiKey.update({
      where: { id: apiKeys[currentKeyIndex].id },
      data: {
        requestCount: { increment: 1 },
        lastUsedAt: new Date()
      }
    })
  }
}

// ─── OpenRouter API Call ─────────────────────────────────────
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const SYSTEM_PROMPT = `You are DevAgent AI, an elite autonomous web developer. Create complete, production-ready projects.

RESPONSE FORMAT - Output ONLY valid JSON (no markdown, no explanations):

FOR NEW PROJECT:
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

FOR EDITING EXISTING PROJECT:
{
  "intent": "edit",
  "edits": [
    {"filename": "index.html", "action": "replace", "startLine": 10, "endLine": 15, "content": "new code"},
    {"filename": "script.js", "action": "append", "content": "code to add at end"},
    {"filename": "styles.css", "action": "insert", "line": 5, "content": "content to insert at line 5"},
    {"filename": "new.js", "action": "create", "content": "new file content"},
    {"filename": "old.js", "action": "delete"}
  ],
  
}

EDIT ACTIONS:
- replace: Replace lines startLine to endLine
- append: Add at end of file
- insert: Insert at specific line
- create: Create new file
- delete: Delete file

RULES:
1. Output ONLY JSON - no explanations
2. COMPLETE working code - zero placeholders
3. When user has existing project, use "intent": "edit"
4. When new project, use "intent": "create"
5. Modern: ES6+, CSS Grid/Flexbox, responsive

Be efficient.`


async function callOpenRouter(prompt: string, socket: any, taskId: string): Promise<string> {
  const maxRetries = apiKeys.length
  let retryCount = 0

  while (retryCount < maxRetries) {
    const apiKey = await getCurrentKey()
    if (!apiKey) {
      socket.emit('agent:error', {
        id: taskId,
        content: 'No API keys available. Please add API keys in settings.',
        timestamp: new Date().toISOString()
      })
      return ''
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://devagent-ai.app',
          'X-Title': 'DevAgent AI'
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
      })

      if (response.status === 429 || response.status === 402) {
        // Rate limit or payment required - rotate key
        console.log(`Key ${apiKeys[currentKeyIndex].label} hit limit (status ${response.status}), rotating...`)
        await rotateKey()
        retryCount++
        continue
      }

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`OpenRouter error (${response.status}): ${errorBody}`)
        socket.emit('agent:error', {
          id: taskId,
          content: `API Error (${response.status}): ${errorBody}`,
          timestamp: new Date().toISOString()
        })
        return ''
      }

      // Stream the response
      await incrementKeyUsage()
      const fullResponse = await streamResponse(response, socket, taskId)
      return fullResponse

    } catch (error: any) {
      console.error(`OpenRouter call failed: ${error.message}`)
      if (error.message.includes('rate') || error.message.includes('limit') || error.message.includes('429')) {
        await rotateKey()
        retryCount++
        continue
      }
      socket.emit('agent:error', {
        id: taskId,
        content: `Network error: ${error.message}`,
        timestamp: new Date().toISOString()
      })
      return ''
    }
  }

  socket.emit('agent:error', {
    id: taskId,
    content: 'All API keys exhausted. Please add more keys or wait for limits to reset.',
    timestamp: new Date().toISOString()
  })
  return ''
}

async function streamResponse(response: Response, socket: any, taskId: string): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let fullResponse = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              fullResponse += content
              socket.emit('agent:stream', {
                id: taskId,
                chunk: content,
                timestamp: new Date().toISOString()
              })
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullResponse
}

// ─── File Parser ─────────────────────────────────────────────
function parseAgentOutput(output: string): { thinking: string; files: ProjectFile[]; summary: string } {
  try {
    // Try to parse as JSON first (new format)
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      const thinking = parsed.thinking || ''
      const files: ProjectFile[] = []

      // Extract files from JSON
      if (parsed.files && Array.isArray(parsed.files)) {
        for (const file of parsed.files) {
          files.push({
            filename: file.filename,
            content: file.content,
            language: file.language || getLanguageFromFilename(file.filename)
          })
        }
      }

      // Build comprehensive summary with setup commands
      let summary = parsed.summary || ''
      if (parsed.project) {
        summary = `Project: ${parsed.project.name}\n${parsed.project.description}\n\n` + summary
      }
      if (parsed.setup && parsed.setup.commands) {
        summary += `\n\n🚀 Run Command: ${parsed.setup.commands.run || 'open index.html'}`
      }
      if (parsed.features && Array.isArray(parsed.features)) {
        summary += `\n\n✨ Features:\n${parsed.features.map((f: string) => `- ${f}`).join('\n')}`
      }

      return { thinking, files, summary }
    }
  } catch (e) {
    console.log('JSON parsing failed, trying legacy format...')
  }

  // Fallback to legacy format if JSON parsing fails
  const thinkingMatch = output.match(/---THINKING---([\s\S]*?)---END THINKING---/)
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : ''

  const files: ProjectFile[] = []
  const fileRegex = /---FILE:\s*(.+?)---([\s\S]*?)---END FILE---/g
  let match
  while ((match = fileRegex.exec(output)) !== null) {
    const filename = match[1].trim()
    const content = match[2].trim()
    const language = getLanguageFromFilename(filename)
    files.push({ filename, content, language })
  }

  const summaryMatch = output.match(/---SUMMARY---([\s\S]*?)---END SUMMARY---/)
  const summary = summaryMatch ? summaryMatch[1].trim() : ''

  // If no structured files found, treat entire output as a single file if it looks like code
  if (files.length === 0) {
    if (output.includes('<html') || output.includes('<!DOCTYPE')) {
      files.push({ filename: 'index.html', content: output.trim(), language: 'html' })
    } else if (output.includes('function') || output.includes('const ') || output.includes('import ')) {
      files.push({ filename: 'script.js', content: output.trim(), language: 'javascript' })
    }
  }

  return { thinking, files, summary }
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'jsx': 'javascript',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'svg': 'svg',
  }
  return langMap[ext] || 'text'
}

// ─── Save Project to Database ────────────────────────────────
async function saveProject(name: string, files: ProjectFile[], description?: string) {
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
  })
  return project
}

// ─── Socket.IO Events ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Send initial state
  socket.emit('state:init', {
    apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
    currentKeyIndex,
    currentModel,
    keyCount: apiKeys.length,
    activeKeyCount: apiKeys.filter(k => k.isActive && !k.limitReached).length,
  })

  // ─── Task Execution ────────────────────────────────────────
  socket.on('task:start', async (data: { prompt: string; projectName?: string; projectId?: string; contextFiles?: any[] }) => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`New task: ${data.prompt}`)

    // Build context with existing project files if provided
    let contextPrompt = data.prompt
    if (data.projectId || data.contextFiles) {
      let existingFiles = data.contextFiles || []

      // If projectId provided, fetch from database
      if (data.projectId && !data.contextFiles) {
        try {
          const project = await prisma.project.findUnique({
            where: { id: data.projectId },
            include: { files: true }
          })
          if (project) {
            existingFiles = project.files.map(f => ({
              filename: f.filename,
              content: f.content,
              language: f.language
            }))
          }
        } catch (e) {
          console.error('Error fetching project:', e)
        }
      }

      // Add context to prompt
      if (existingFiles.length > 0) {
        contextPrompt = `EXISTING PROJECT CONTEXT:\n\n`
        for (const file of existingFiles) {
          contextPrompt += `FILE: ${file.filename}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`
        }
        contextPrompt += `\nUSER REQUEST: ${data.prompt}\n\nProvide edit operations in JSON format with "intent": "edit".`
      }
    }

    // Create task record
    agentTasks.set(taskId, {
      prompt: data.prompt,
      status: 'running',
      messages: []
    })

    // Save to database
    const dbTask = await prisma.agentTask.create({
      data: {
        taskPrompt: data.prompt,
        status: 'running',
        modelUsed: currentModel,
      }
    })

    socket.emit('task:started', {
      id: taskId,
      dbId: dbTask.id,
      prompt: data.prompt,
      timestamp: new Date().toISOString()
    })

    // Call the agent
    const fullResponse = await callOpenRouter(contextPrompt, socket, taskId)

    if (fullResponse) {
      // Parse the response
      const parsed = parseAgentOutput(fullResponse)

      // Check intent - create or edit
      let intent = 'create'
      let edits = []
      try {
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0])
          intent = jsonData.intent || 'create'
          edits = jsonData.edits || []
        }
      } catch (e) { }

      // Handle EDIT intent - Propose edits for review (don't apply automatically)
      if (intent === 'edit' && edits.length > 0) {
        const fs = require('fs')
        const path = require('path')
        const projectPath = data.projectId ?
          path.join(__dirname, '../../generated-projects', data.projectName || data.projectId) :
          path.join(__dirname, '../../generated-projects', `Project_${Date.now()}`)

        // Ensure project directory exists
        if (!fs.existsSync(projectPath)) {
          fs.mkdirSync(projectPath, { recursive: true })
          console.log(`📁 Created directory: ${projectPath}`)
        }

        socket.emit('agent:summary', {
          id: taskId,
          content: `Review ${edits.length} proposed edit(s). Accept or reject each change.`,
          timestamp: new Date().toISOString()
        })

        // Send edit proposals with current content for diff view
        const proposedEdits = edits.map((edit, index) => {
          const filePath = path.join(projectPath, edit.filename)
          const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''

          return {
            editId: `${taskId}_edit_${index}`,
            filename: edit.filename,
            action: edit.action,
            currentContent: currentContent,
            newContent: edit.content,
            startLine: edit.startLine,
            endLine: edit.endLine,
            line: edit.line,
            language: edit.language || getLanguageFromFilename(edit.filename),
            projectPath: projectPath
          }
        })

        socket.emit('edits:proposed', {
          id: taskId,
          projectPath: projectPath,
          edits: proposedEdits,
          timestamp: new Date().toISOString()
        })

        console.log(`📋 Proposed ${edits.length} edits for review`)
      }
      // Handle CREATE intent (original flow - auto-apply)
      else {

        for (const edit of edits) {
          try {
            const filePath = path.join(projectPath, edit.filename)

            if (edit.action === 'create') {
              fs.writeFileSync(filePath, edit.content, 'utf8')
              console.log(`✅ Created: ${edit.filename}`)
              socket.emit('agent:file', {
                id: taskId,
                filename: edit.filename,
                content: edit.content,
                language: edit.language || getLanguageFromFilename(edit.filename),
                timestamp: new Date().toISOString()
              })
            }
            else if (edit.action === 'delete') {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
                console.log(`🗑️ Deleted: ${edit.filename}`)
                socket.emit('file:deleted', {
                  id: taskId,
                  filename: edit.filename,
                  timestamp: new Date().toISOString()
                })
              }
            }
            else if (edit.action === 'append') {
              let fileContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
              fileContent += '\n' + edit.content
              fs.writeFileSync(filePath, fileContent, 'utf8')
              console.log(`➕ Appended to: ${edit.filename}`)
              // Send updated file content
              socket.emit('agent:file', {
                id: taskId,
                filename: edit.filename,
                content: fileContent,
                language: getLanguageFromFilename(edit.filename),
                timestamp: new Date().toISOString()
              })
            }
            else if (edit.action === 'insert') {
              let fileContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
              const lines = fileContent.split('\n')
              lines.splice(edit.line - 1, 0, edit.content)
              const updatedContent = lines.join('\n')
              fs.writeFileSync(filePath, updatedContent, 'utf8')
              console.log(`📝 Inserted in: ${edit.filename} at line ${edit.line}`)
              // Send updated file content
              socket.emit('agent:file', {
                id: taskId,
                filename: edit.filename,
                content: updatedContent,
                language: getLanguageFromFilename(edit.filename),
                timestamp: new Date().toISOString()
              })
            }
            else if (edit.action === 'replace') {
              let fileContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
              const lines = fileContent.split('\n')
              lines.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, edit.content)
              const updatedContent = lines.join('\n')
              fs.writeFileSync(filePath, updatedContent, 'utf8')
              console.log(`🔄 Replaced in: ${edit.filename} lines ${edit.startLine}-${edit.endLine}`)
              // Send updated file content
              socket.emit('agent:file', {
                id: taskId,
                filename: edit.filename,
                content: updatedContent,
                language: getLanguageFromFilename(edit.filename),
                timestamp: new Date().toISOString()
              })
            }

            socket.emit('edit:applied', {
              id: taskId,
              filename: edit.filename,
              action: edit.action,
              timestamp: new Date().toISOString()
            })
          } catch (error: any) {
            console.error(`Edit error for ${edit.filename}:`, error.message)
            socket.emit('agent:error', {
              id: taskId,
              content: `Edit failed for ${edit.filename}: ${error.message}`,
              timestamp: new Date().toISOString()
            })
          }
        }

        socket.emit('project:edited', {
          id: taskId,
          projectPath: projectPath,
          editsCount: edits.length,
          timestamp: new Date().toISOString()
        })
      }
      // Handle CREATE intent (original flow)
      else {

        // Emit thinking
        if (parsed.thinking) {
          socket.emit('agent:thinking', {
            id: taskId,
            content: parsed.thinking,
            timestamp: new Date().toISOString()
          })
        }

        // Emit each file
        for (const file of parsed.files) {
          socket.emit('agent:file', {
            id: taskId,
            filename: file.filename,
            content: file.content,
            language: file.language,
            timestamp: new Date().toISOString()
          })
        }

        // Emit summary
        if (parsed.summary) {
          socket.emit('agent:summary', {
            id: taskId,
            content: parsed.summary,
            timestamp: new Date().toISOString()
          })
        }

        // Save project
        if (parsed.files.length > 0) {
          const projectName = data.projectName || `Project_${Date.now()}`
          const project = await saveProject(projectName, parsed.files, parsed.summary)

          // CREATE FILES PHYSICALLY IN WORKSPACE
          const fs = require('fs')
          const path = require('path')
          const projectPath = path.join(__dirname, '../../generated-projects', projectName)

          try {
            // Create project directory
            if (!fs.existsSync(projectPath)) {
              fs.mkdirSync(projectPath, { recursive: true })
            }

            // Create each file
            for (const file of parsed.files) {
              const filePath = path.join(projectPath, file.filename)
              fs.writeFileSync(filePath, file.content, 'utf8')
              console.log(`✅ Created: ${file.filename}`)
            }

            // Get run command from JSON if available
            let runCommand = 'start index.html'
            try {
              const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0])
                if (jsonData.setup && jsonData.setup.commands && jsonData.setup.commands.run) {
                  runCommand = jsonData.setup.commands.run
                }
              }
            } catch (e) { }

            socket.emit('project:created', {
              id: taskId,
              projectId: project.id,
              projectName: project.name,
              projectPath: projectPath,
              files: parsed.files,
              runCommand: runCommand,
              timestamp: new Date().toISOString()
            })

            // Emit action to run the project
            socket.emit('project:action', {
              id: taskId,
              action: 'files_created',
              path: projectPath,
              command: runCommand,
              message: `Files created at: ${projectPath}`,
              timestamp: new Date().toISOString()
            })

          } catch (error: any) {
            console.error('File creation error:', error)
            socket.emit('agent:error', {
              id: taskId,
              content: `File creation failed: ${error.message}`,
              timestamp: new Date().toISOString()
            })
          }
        }
      } // End of else (create intent)

      // Update task status
      await prisma.agentTask.update({
        where: { id: dbTask.id },
        data: {
          agentOutput: fullResponse,
          status: 'completed',
          keyUsed: apiKeys[currentKeyIndex]?.key.slice(0, 8) + '...',
        }
      })
    }

    // Task complete
    socket.emit('task:complete', {
      id: taskId,
      timestamp: new Date().toISOString()
    })

    // Send updated key stats
    socket.emit('state:keys', {
      apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
      currentKeyIndex,
      keyCount: apiKeys.length,
      activeKeyCount: apiKeys.filter(k => k.isActive && !k.limitReached).length,
    })
  })

  // ─── Edit Accept/Reject Handlers ────────────────────────────
  socket.on('edit:accept', async (data: { editId: string; filename: string; action: string; currentContent: string; newContent: string; startLine?: number; endLine?: number; line?: number; projectPath: string }) => {
    try {
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(data.projectPath, data.filename)

      let updatedContent = ''

      if (data.action === 'create') {
        fs.writeFileSync(filePath, data.newContent, 'utf8')
        updatedContent = data.newContent
        console.log(`✅ Created: ${data.filename}`)
      }
      else if (data.action === 'delete') {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          console.log(`🗑️ Deleted: ${data.filename}`)
        }
      }
      else if (data.action === 'append') {
        let fileContent = data.currentContent
        fileContent += '\n' + data.newContent
        fs.writeFileSync(filePath, fileContent, 'utf8')
        updatedContent = fileContent
        console.log(`➕ Appended to: ${data.filename}`)
      }
      else if (data.action === 'insert' && data.line) {
        let fileContent = data.currentContent
        const lines = fileContent.split('\n')
        lines.splice(data.line - 1, 0, data.newContent)
        updatedContent = lines.join('\n')
        fs.writeFileSync(filePath, updatedContent, 'utf8')
        console.log(`📝 Inserted in: ${data.filename} at line ${data.line}`)
      }
      else if (data.action === 'replace' && data.startLine && data.endLine) {
        let fileContent = data.currentContent
        const lines = fileContent.split('\n')
        lines.splice(data.startLine - 1, data.endLine - data.startLine + 1, data.newContent)
        updatedContent = lines.join('\n')
        fs.writeFileSync(filePath, updatedContent, 'utf8')
        console.log(`🔄 Replaced in: ${data.filename} lines ${data.startLine}-${data.endLine}`)
      }

      // Emit updated file to frontend
      if (data.action !== 'delete') {
        socket.emit('agent:file', {
          filename: data.filename,
          content: updatedContent,
          language: getLanguageFromFilename(data.filename),
          timestamp: new Date().toISOString()
        })
      }

      socket.emit('edit:accepted', {
        editId: data.editId,
        filename: data.filename,
        success: true,
        timestamp: new Date().toISOString()
      })
    } catch (error: any) {
      console.error(`Error accepting edit:`, error.message)
      socket.emit('edit:accepted', {
        editId: data.editId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  })

  socket.on('edit:reject', async (data: { editId: string; filename: string }) => {
    console.log(`❌ Rejected edit for: ${data.filename}`)
    socket.emit('edit:rejected', {
      editId: data.editId,
      filename: data.filename,
      timestamp: new Date().toISOString()
    })
  })

  // ─── API Key Management ─────────────────────────────────────
  socket.on('keys:add', async (data: { key: string; label?: string }) => {
    try {
      const newKey = await prisma.apiKey.create({
        data: {
          key: data.key,
          label: data.label || `Key ${data.key.slice(-4)}`,
          isActive: true,
        }
      })
      await loadApiKeys()
      socket.emit('keys:updated', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        success: true,
      })
      console.log(`Added API key: ${newKey.label}`)
    } catch (error: any) {
      socket.emit('keys:error', { message: error.message })
    }
  })

  socket.on('keys:remove', async (data: { id: string }) => {
    try {
      await prisma.apiKey.delete({ where: { id: data.id } })
      await loadApiKeys()
      socket.emit('keys:updated', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        success: true,
      })
      console.log(`Removed API key: ${data.id}`)
    } catch (error: any) {
      socket.emit('keys:error', { message: error.message })
    }
  })

  socket.on('keys:toggle', async (data: { id: string; active: boolean }) => {
    try {
      await prisma.apiKey.update({
        where: { id: data.id },
        data: { isActive: data.active }
      })
      await loadApiKeys()
      socket.emit('keys:updated', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        success: true,
      })
    } catch (error: any) {
      socket.emit('keys:error', { message: error.message })
    }
  })

  socket.on('keys:reset', async () => {
    try {
      await prisma.apiKey.updateMany({ data: { limitReached: false } })
      await loadApiKeys()
      socket.emit('keys:updated', {
        apiKeys: apiKeys.map(k => ({ ...k, key: k.key.slice(0, 8) + '...' })),
        currentKeyIndex,
        success: true,
      })
      console.log('All API key limits reset')
    } catch (error: any) {
      socket.emit('keys:error', { message: error.message })
    }
  })

  // ─── Model Management ──────────────────────────────────────
  socket.on('model:set', async (data: { model: string }) => {
    currentModel = data.model
    socket.emit('model:updated', { model: currentModel })
    console.log(`Model changed to: ${currentModel}`)
  })

  // ─── Project Management ─────────────────────────────────────
  socket.on('projects:list', async () => {
    const projects = await prisma.project.findMany({
      include: { files: true },
      orderBy: { createdAt: 'desc' }
    })
    socket.emit('projects:list', { projects })
  })

  socket.on('projects:delete', async (data: { id: string }) => {
    try {
      await prisma.projectFile.deleteMany({ where: { projectId: data.id } })
      await prisma.project.delete({ where: { id: data.id } })
      socket.emit('projects:deleted', { id: data.id, success: true })
    } catch (error: any) {
      socket.emit('projects:error', { message: error.message })
    }
  })

  // ─── Task History ──────────────────────────────────────────
  socket.on('tasks:list', async () => {
    const tasks = await prisma.agentTask.findMany({ orderBy: { createdAt: 'desc' } })
    socket.emit('tasks:list', { tasks })
  })

  // ─── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// ─── Initialize ───────────────────────────────────────────────
async function init() {
  await loadApiKeys()
  console.log(`Agent service initialized with ${apiKeys.length} API keys`)
  console.log(`Current model: ${currentModel}`)
}

const PORT = 3003
httpServer.listen(PORT, async () => {
  await init()
  console.log(`🤖 DevAgent AI service running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  prisma.$disconnect()
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  prisma.$disconnect()
  httpServer.close(() => process.exit(0))
})
