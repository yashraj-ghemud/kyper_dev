'use client'

import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAgentStore, AgentMessage, ProjectFile, ApiKeyInfo } from '@/store/agent-store'
import { DiffViewer } from '@/components/DiffViewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Bot, Send, Settings, Key, Terminal, Code2, Eye, FileCode,
  Cpu, Zap, ChevronRight, Play, Trash2, RefreshCw, FolderOpen,
  X, Plus, AlertCircle, CheckCircle2, Loader2, Sparkles,
  MessageSquare, Brain, RotateCcw, Download, LayoutGrid
} from 'lucide-react'

export default function Home() {
  const store = useAgentStore()
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Local state
  const [chatInput, setChatInput] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [selectedModel, setSelectedModel] = useState(store.currentModel)
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'preview'>('chat')
  const [bottomTab, setBottomTab] = useState<'terminal' | 'logs'>('terminal')
  const [leftPanelMode, setLeftPanelMode] = useState<'chat' | 'history'>('chat')

  // Context control
  const [sendAllFiles, setSendAllFiles] = useState(false)
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([])
  const [showFileSelector, setShowFileSelector] = useState(false)

  // ─── Update Preview Function ──────────────────────────────
  const updatePreview = () => {
    if (!previewRef.current) return

    const currentFiles = useAgentStore.getState().projectFiles
    const htmlFiles = currentFiles.filter(f => f.filename.endsWith('.html') || f.filename.endsWith('.htm'))
    if (htmlFiles.length === 0) return

    const mainHtml = htmlFiles.find(f => f.filename === 'index.html') || htmlFiles[0]
    let htmlContent = mainHtml.content

    const cssFiles = currentFiles.filter(f => f.filename.endsWith('.css'))
    for (const css of cssFiles) {
      const linkPattern = `<link[^>]*href=["']${css.filename}["'][^>]*>`
      if (htmlContent.match(new RegExp(linkPattern))) {
        htmlContent = htmlContent.replace(new RegExp(linkPattern), `<style>${css.content}</style>`)
      } else {
        htmlContent = htmlContent.replace('</head>', `<style>${css.content}</style>\n</head>`)
      }
    }

    const jsFiles = currentFiles.filter(f => f.filename.endsWith('.js') && !f.filename.endsWith('.json'))
    for (const js of jsFiles) {
      const scriptPattern = `<script[^>]*src=["']${js.filename}["'][^>]*></script>`
      if (htmlContent.match(new RegExp(scriptPattern))) {
        htmlContent = htmlContent.replace(new RegExp(scriptPattern), `<script>${js.content}</script>`)
      } else {
        htmlContent = htmlContent.replace('</body>', `<script>${js.content}</script>\n</body>`)
      }
    }

    const iframe = previewRef.current
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(htmlContent)
      doc.close()
    }
  }

  // ─── Socket.IO Connection ────────────────────────────────
  useEffect(() => {
    const socketInstance = io('http://localhost:3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    })

    store.setSocket(socketInstance)

    socketInstance.on('connect', () => {
      store.setConnected(true)
      store.addTerminalLog('✅ Connected to DevAgent AI service')
    })

    socketInstance.on('disconnect', () => {
      store.setConnected(false)
      store.addTerminalLog('❌ Disconnected from service')
    })

    // ─── Agent Events ──────────────────────────────────────
    socketInstance.on('state:init', (data) => {
      store.setApiKeys(data.apiKeys, data.currentKeyIndex, data.activeKeyCount)
      store.setCurrentModel(data.currentModel)
      setSelectedModel(data.currentModel)
      store.addTerminalLog(`🤖 Agent initialized | Model: ${data.currentModel} | Keys: ${data.activeKeyCount}/${data.keyCount}`)
    })

    socketInstance.on('task:started', (data) => {
      store.addMessage({
        id: data.id,
        type: 'system',
        content: `🚀 Task started: "${data.prompt}"`,
        timestamp: data.timestamp
      })
      store.addTerminalLog(`🚀 Task started: ${data.prompt}`)
      store.setAgentRunning(true)
    })

    socketInstance.on('agent:stream', (data) => {
      store.appendStreamText(data.chunk)
    })

    socketInstance.on('agent:thinking', (data) => {
      store.addMessage({
        id: `thinking_${data.id}`,
        type: 'thinking',
        content: data.content,
        timestamp: data.timestamp
      })
      store.addTerminalLog('💭 Agent is thinking...')
    })

    socketInstance.on('agent:file', (data) => {
      store.addProjectFile({
        filename: data.filename,
        content: data.content,
        language: data.language
      })
      store.addMessage({
        id: `file_${data.filename}_${Date.now()}`,
        type: 'file',
        content: `Created file: ${data.filename}`,
        timestamp: data.timestamp,
        filename: data.filename,
        language: data.language
      })
      store.addTerminalLog(`📄 File created: ${data.filename} (${data.content.length} chars)`)
      // Auto-switch to preview if we have HTML files
      if (data.filename.endsWith('.html') || data.filename.endsWith('.htm')) {
        setActiveTab('preview')
      }
    })

    socketInstance.on('agent:summary', (data) => {
      store.addMessage({
        id: `summary_${Date.now()}`,
        type: 'summary',
        content: data.content,
        timestamp: data.timestamp
      })
      store.addTerminalLog('✅ Task completed: ' + data.content.slice(0, 50) + '...')
    })

    socketInstance.on('agent:error', (data) => {
      store.addMessage({
        id: `error_${Date.now()}`,
        type: 'error',
        content: data.content,
        timestamp: data.timestamp
      })
      store.addTerminalLog(`❌ Error: ${data.content}`)
      store.setAgentRunning(false)
    })

    socketInstance.on('task:complete', (data) => {
      store.addMessage({
        id: `complete_${data.id}`,
        type: 'system',
        content: '✅ Task completed successfully!',
        timestamp: data.timestamp
      })
      store.setAgentRunning(false)
      store.clearStreamText()
      store.addTerminalLog('✅ Task completed')
      // Auto switch to preview
      if (store.projectFiles.length > 0) {
        setActiveTab('preview')
      }
    })

    socketInstance.on('project:created', (data) => {
      store.setCurrentProjectId(data.projectId)
      store.addTerminalLog(`📁 Project saved: ${data.projectName}`)
      if (data.projectPath) {
        store.addTerminalLog(`📂 Files created at: ${data.projectPath}`)
      }
      if (data.runCommand) {
        store.addTerminalLog(`🚀 Run command: ${data.runCommand}`)
      }
      updatePreview()
    })

    socketInstance.on('project:action', (data) => {
      if (data.action === 'files_created') {
        store.addTerminalLog(`✅ ${data.message}`)
        store.addTerminalLog(`💡 To run: cd "${data.path}" && ${data.command}`)
      }
    })

    socketInstance.on('edit:applied', (data) => {
      store.addTerminalLog(`📝 ${data.action}: ${data.filename}`)

      // Reload the edited file content from backend
      // Since we don't have the new content in the event, we'll reload all files after editing
    })

    socketInstance.on('edits:proposed', (data: { id: string; projectPath: string; edits: any[]; timestamp: string }) => {
      store.addTerminalLog(`📋 Review ${data.edits.length} proposed edit(s)`)
      store.setPendingEdits(data.edits.map(edit => ({
        ...edit,
        status: 'pending' as const
      })))
      // Switch to a diff review tab
      setActiveTab('files')
    })

    socketInstance.on('edit:accepted', (data: { editId: string; success: boolean; error?: string }) => {
      if (data.success) {
        store.updateEditStatus(data.editId, 'accepted')
        store.addTerminalLog(`✅ Edit accepted`)
      } else {
        store.addTerminalLog(`❌ Error accepting edit: ${data.error}`)
      }
    })

    socketInstance.on('edit:rejected', (data: { editId: string; filename: string }) => {
      store.updateEditStatus(data.editId, 'rejected')
      store.addTerminalLog(`❌ Edit rejected for ${data.filename}`)
    })

    socketInstance.on('project:edited', (data) => {
      store.addTerminalLog(`✅ Applied ${data.editsCount} edits successfully`)
      store.addTerminalLog(`📂 Project updated at: ${data.projectPath}`)

      // Reload files from the filesystem to show updated content
      // Request updated files from backend
      if (store.currentProjectId) {
        store.socket?.emit('project:load', { id: store.currentProjectId })
      }
    })

    // ─── Key Management Events ──────────────────────────────
    socketInstance.on('keys:updated', (data) => {
      store.setApiKeys(data.apiKeys, data.currentKeyIndex, data.activeKeyCount)
      if (data.success) store.addTerminalLog('🔑 API keys updated')
    })

    socketInstance.on('keys:error', (data) => {
      store.addTerminalLog(`❌ Key error: ${data.message}`)
    })

    socketInstance.on('state:keys', (data) => {
      store.setApiKeys(data.apiKeys, data.currentKeyIndex, data.activeKeyCount)
    })

    // ─── Model Events ──────────────────────────────────────
    socketInstance.on('model:updated', (data) => {
      store.setCurrentModel(data.model)
      store.addTerminalLog(`🧠 Model changed to: ${data.model}`)
    })

    // ─── Project Events ─────────────────────────────────────
    socketInstance.on('projects:list', (data) => {
      store.setProjects(data.projects)
    })

    socketInstance.on('projects:deleted', (data) => {
      store.addTerminalLog(`🗑️ Project deleted: ${data.id}`)
    })

    socketInstance.on('projects:error', (data) => {
      store.addTerminalLog(`❌ Project error: ${data.message}`)
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  // ─── Auto-scroll chat ────────────────────────────────────
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [store.messages, store.streamingText])

  // ─── Auto-scroll terminal ────────────────────────────────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [store.terminalLogs])

  // Update preview when files change
  useEffect(() => {
    if (store.projectFiles.length > 0) {
      setTimeout(updatePreview, 100)
    }
  }, [store.projectFiles, updatePreview])

  // ─── Send Task ────────────────────────────────────────────
  const sendTask = () => {
    if (!chatInput.trim() || !store.isConnected || store.isAgentRunning) return

    const prompt = chatInput.trim()
    store.addMessage({
      id: `user_${Date.now()}`,
      type: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    })

    // Prepare context files
    let contextFiles: any[] = []

    if (sendAllFiles && store.currentProjectId) {
      // Send all files from current project
      contextFiles = store.projectFiles.map(f => ({
        filename: f.filename,
        content: f.content,
        language: f.language
      }))
    } else if (selectedContextFiles.length > 0) {
      // Send only selected files
      contextFiles = store.projectFiles
        .filter(f => selectedContextFiles.includes(f.filename))
        .map(f => ({
          filename: f.filename,
          content: f.content,
          language: f.language
        }))
    }

    // If no context selected, clear files for fresh start
    if (!sendAllFiles && selectedContextFiles.length === 0) {
      store.clearProjectFiles()
    }

    // Emit with context
    store.socket?.emit('task:start', {
      prompt,
      projectId: sendAllFiles ? store.currentProjectId : undefined,
      contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
      projectName: store.currentProjectId // Send project name for folder creation
    })

    // Add helpful message
    if (contextFiles.length > 0) {
      store.addTerminalLog(`📤 Sending ${contextFiles.length} file(s) as context`)
    } else if (store.projectFiles.length > 0) {
      store.addTerminalLog(`💡 Tip: Use + button to include existing files for editing`)
    }

    setChatInput('')
    setActiveTab('chat')
  }

  // ─── Add API Key ──────────────────────────────────────────
  const addApiKey = () => {
    if (!newApiKey.trim()) return
    store.socket?.emit('keys:add', { key: newApiKey.trim(), label: newKeyLabel.trim() || undefined })
    setNewApiKey('')
    setNewKeyLabel('')
  }

  // ─── Remove API Key ───────────────────────────────────────
  const removeApiKey = (id: string) => {
    store.socket?.emit('keys:remove', { id })
  }

  // ─── Toggle API Key ───────────────────────────────────────
  const toggleApiKey = (id: string, active: boolean) => {
    store.socket?.emit('keys:toggle', { id, active })
  }

  // ─── Reset Key Limits ─────────────────────────────────────
  const resetKeyLimits = () => {
    store.socket?.emit('keys:reset')
  }

  // ─── Change Model ─────────────────────────────────────────
  const changeModel = () => {
    store.socket?.emit('model:set', { model: selectedModel })
  }

  // ─── Get selected file content ────────────────────────────
  const getSelectedFileContent = () => {
    const file = store.projectFiles.find(f => f.filename === store.selectedFile)
    return file?.content || ''
  }

  // ─── Get file icon color based on language ────────────────
  const getFileIconColor = (language: string) => {
    const colors: Record<string, string> = {
      html: '#e44d26',
      css: '#264de4',
      javascript: '#f7df1e',
      typescript: '#3178c6',
      json: '#292929',
      python: '#3572a5',
      svg: '#ffb13b',
    }
    return colors[language] || '#6b7280'
  }

  // ─── Render streaming agent output ────────────────────────
  const renderStreamOutput = () => {
    if (!store.streamingText && !store.isAgentRunning) return null

    // Parse current stream for partial files being written
    const text = store.streamingText
    const lines = text.split('\n')

    return (
      <div className="bg-zinc-900/50 rounded-lg p-3 border border-emerald-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
          <span className="text-emerald-400 text-xs font-medium">Agent is coding...</span>
        </div>
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap overflow-hidden max-h-48 overflow-y-auto font-mono leading-relaxed">
          {text.slice(-500)}
        </pre>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden" suppressHydrationWarning>
      {/* ─── TOP BAR ────────────────────────────────────────── */}
      <header className="h-11 bg-zinc-900 border-b border-zinc-800 flex items-center px-3 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-sm tracking-wide">DevAgent AI</span>
          <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            Agentic
          </Badge>
        </div>

        <Separator orientation="vertical" className="h-6 bg-zinc-700" />

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Cpu className="w-3 h-3" />
          <span>Model: <span className="text-emerald-400 font-medium">{store.currentModel}</span></span>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Key className="w-3 h-3" />
          <span>Keys: <span className="text-emerald-400 font-medium">{store.activeKeyCount}</span> active</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {store.isConnected ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Disconnected
            </span>
          )}
        </div>

        <div className="flex-1" />

        {store.isAgentRunning && (
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            <span className="text-emerald-400">Agent Running...</span>
            <Progress value={undefined} className="w-16 h-1.5 bg-zinc-800" />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-zinc-400 hover:text-zinc-100"
          onClick={() => store.setSettingsOpen(true)}
        >
          <Settings className="w-3.5 h-3.5 mr-1" />
          Settings
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-zinc-400 hover:text-zinc-100"
          onClick={() => {
            store.clearAll()
            store.addTerminalLog('🔄 Session cleared')
          }}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT PANEL: Chat ─────────────────────────────── */}
        <div className="w-[380px] border-r border-zinc-800 flex flex-col bg-zinc-950 shrink-0">
          {/* Chat Tabs */}
          <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-1 shrink-0">
            <Button
              variant={leftPanelMode === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setLeftPanelMode('chat')}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Chat
            </Button>
            <Button
              variant={leftPanelMode === 'history' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                setLeftPanelMode('history')
                store.socket?.emit('projects:list')
              }}
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              Projects
            </Button>
            <div className="flex-1" />
            <span className="text-xs text-zinc-500">{store.messages.length} msgs</span>
          </div>

          {leftPanelMode === 'chat' ? (
            <>
              {/* Chat Messages */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                {store.messages.length === 0 && !store.isAgentRunning && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <Brain className="w-12 h-12 text-emerald-500/30 mb-4" />
                    <h3 className="text-lg font-semibold text-zinc-300 mb-2">DevAgent AI</h3>
                    <p className="text-sm text-zinc-500 mb-6 max-w-[280px]">
                      Autonomous coding agent. Tell it what to build, and it will create it for you.
                    </p>
                    <div className="space-y-2 w-full max-w-[280px]">
                      {[
                        'Create a snake game',
                        'Build a todo app with dark theme',
                        'Make a calculator website',
                        'Build a weather dashboard'
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          className="w-full text-xs text-zinc-400 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/30 rounded-md px-3 py-2 transition-all text-left"
                          onClick={() => setChatInput(suggestion)}
                        >
                          <Sparkles className="w-3 h-3 mr-1.5 text-emerald-400/50 inline" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {store.messages.map((msg) => (
                  <div key={msg.id} className={`rounded-lg ${msg.type === 'user' ? 'bg-emerald-500/10 border border-emerald-500/20 ml-4' :
                    msg.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                      msg.type === 'system' ? 'bg-zinc-800/50 border border-zinc-700/30' :
                        msg.type === 'file' ? 'bg-blue-500/10 border border-blue-500/20' :
                          msg.type === 'thinking' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                            msg.type === 'summary' ? 'bg-emerald-500/15 border border-emerald-500/30' :
                              'bg-zinc-900/50 border border-zinc-800/50'
                    } px-3 py-2.5`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {msg.type === 'user' && <Send className="w-3 h-3 text-emerald-400" />}
                      {msg.type === 'agent' && <Bot className="w-3 h-3 text-violet-400" />}
                      {msg.type === 'system' && <Cpu className="w-3 h-3 text-zinc-400" />}
                      {msg.type === 'file' && <FileCode className="w-3 h-3 text-blue-400" />}
                      {msg.type === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                      {msg.type === 'thinking' && <Brain className="w-3 h-3 text-yellow-400" />}
                      {msg.type === 'summary' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      <span className="text-xs font-medium text-zinc-400">
                        {msg.type === 'user' ? 'You' :
                          msg.type === 'file' ? msg.filename || 'File' :
                            msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}
                      </span>
                      <span className="text-xs text-zinc-600 ml-auto">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={`text-sm ${msg.type === 'thinking' ? 'text-yellow-300/80 italic' :
                      msg.type === 'summary' ? 'text-emerald-300' :
                        msg.type === 'error' ? 'text-red-300' :
                          msg.type === 'file' ? 'text-blue-300' :
                            'text-zinc-200'
                      }`}>
                      {msg.type === 'thinking' ? (
                        <pre className="whitespace-pre-wrap text-xs">{msg.content}</pre>
                      ) : msg.type === 'file' ? (
                        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                          onClick={() => {
                            store.setSelectedFile(msg.filename || null)
                            setActiveTab('files')
                          }}>
                          <span className="font-mono text-xs">{msg.filename}</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Streaming output */}
                {renderStreamOutput()}
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
                {/* File Selector Popup */}
                {showFileSelector && (
                  <div className="mb-2 p-3 bg-zinc-800/80 border border-zinc-700 rounded-md max-h-48 overflow-y-auto">
                    <div className="text-xs text-zinc-400 mb-2 flex items-center justify-between">
                      <span className="font-semibold">Context Files</span>
                      <button onClick={() => setShowFileSelector(false)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Send All Files Checkbox */}
                    {store.projectFiles.length > 0 ? (
                      <>
                        <label className="flex items-center gap-2 py-2 px-2 mb-2 bg-emerald-500/10 border border-emerald-500/30 rounded cursor-pointer hover:bg-emerald-500/20">
                          <input
                            type="checkbox"
                            checked={sendAllFiles}
                            onChange={(e) => {
                              setSendAllFiles(e.target.checked)
                              if (e.target.checked) {
                                setSelectedContextFiles([])
                              }
                            }}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
                          />
                          <span className="text-xs font-semibold text-emerald-400">Send All Files ({store.projectFiles.length})</span>
                        </label>

                        {/* Individual File Selection */}
                        {!sendAllFiles && (
                          <div className="space-y-1">
                            {store.projectFiles.map((file) => {
                              const lineCount = file.content.split('\n').length
                              return (
                                <label key={file.filename} className="flex items-center gap-2 py-1.5 px-2 hover:bg-zinc-700/50 rounded cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={selectedContextFiles.includes(file.filename)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedContextFiles([...selectedContextFiles, file.filename])
                                      } else {
                                        setSelectedContextFiles(selectedContextFiles.filter(f => f !== file.filename))
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500"
                                  />
                                  <div className="flex-1 flex items-center justify-between">
                                    <span className="text-xs text-zinc-300 group-hover:text-zinc-100">{file.filename}</span>
                                    <span className="text-[10px] text-zinc-500">{lineCount} lines</span>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-4 text-center">
                        <p className="text-xs text-zinc-500">No files loaded yet. Load a project to select context files.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Context indicators */}
                {(sendAllFiles || selectedContextFiles.length > 0) && (
                  <div className="mb-2 flex gap-2 flex-wrap">
                    {sendAllFiles && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        All files ({store.projectFiles.length})
                        <button onClick={() => setSendAllFiles(false)} className="ml-1 hover:text-emerald-300">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {!sendAllFiles && selectedContextFiles.map(filename => {
                      const file = store.projectFiles.find(f => f.filename === filename)
                      const lineCount = file ? file.content.split('\n').length : 0
                      return (
                        <span key={filename} className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md flex items-center gap-1">
                          {filename} <span className="text-blue-500/60">({lineCount}L)</span>
                          <button
                            onClick={() => setSelectedContextFiles(selectedContextFiles.filter(f => f !== filename))}
                            className="ml-1 hover:text-blue-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  {/* Plus button for file selector */}
                  <Button
                    onClick={(e) => {
                      e.preventDefault()
                      console.log('+ button clicked, current state:', showFileSelector)
                      setShowFileSelector(!showFileSelector)
                    }}
                    disabled={store.isAgentRunning || !store.isConnected}
                    variant="outline"
                    className={`shrink-0 h-[40px] ${(selectedContextFiles.length > 0 || sendAllFiles) ? 'border-blue-500/50 text-blue-400' : ''}`}
                    title="Add files as context"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>

                  <Textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={store.isAgentRunning ? "Agent is working..." : "Tell DevAgent what to build..."}
                    disabled={store.isAgentRunning || !store.isConnected}
                    className="min-h-[40px] max-h-[80px] resize-none bg-zinc-900 border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendTask()
                      }
                    }}
                  />
                  <Button
                    onClick={sendTask}
                    disabled={!chatInput.trim() || store.isAgentRunning || !store.isConnected}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 h-[40px]"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ─── Projects History ─────────────────────────────── */
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {store.projects.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-sm">
                    No projects yet. Start by giving DevAgent a task!
                  </div>
                ) : (
                  store.projects.map((project) => (
                    <Card key={project.id} className="bg-zinc-900/50 border-zinc-700/50 p-3 hover:border-emerald-500/30 transition-all">
                      <div className="flex items-start gap-2">
                        {/* Checkbox for context */}
                        <input
                          type="checkbox"
                          checked={sendAllFiles && store.currentProjectId === project.id}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (e.target.checked) {
                              setSendAllFiles(true)
                              store.setCurrentProjectId(project.id)
                              // Load project files
                              const files = project.files.map(f => ({
                                filename: f.filename,
                                content: f.content,
                                language: f.language || 'text'
                              }))
                              files.forEach(f => store.addProjectFile(f))
                            } else {
                              setSendAllFiles(false)
                            }
                          }}
                          className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />

                        {/* Project Info */}
                        <div className="flex-1 cursor-pointer" onClick={() => {
                          // Load project files
                          const files = project.files.map(f => ({
                            filename: f.filename,
                            content: f.content,
                            language: f.language || 'text'
                          }))
                          files.forEach(f => store.addProjectFile(f))
                          store.setCurrentProjectId(project.id)
                          setActiveTab('preview')
                          setTimeout(updatePreview, 200)
                        }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-zinc-200">{project.name}</span>
                              <span className="text-xs text-zinc-500 ml-2">{project.files.length} files</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-red-400 hover:text-red-300 h-6"
                              onClick={(e) => {
                                e.stopPropagation()
                                store.socket?.emit('projects:delete', { id: project.id })
                              }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          {project.description && (
                            <p className="text-xs text-zinc-500 mt-1">{project.description}</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ─── CENTER+RIGHT: Code + Preview ────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 shrink-0">
            <Button
              variant={activeTab === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Chat
            </Button>
            <Button
              variant={activeTab === 'files' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveTab('files')}
            >
              <Code2 className="w-3 h-3 mr-1" />
              Code
              {store.projectFiles.length > 0 && (
                <Badge variant="outline" className="text-xs ml-1 border-zinc-600 text-zinc-400 bg-zinc-800">
                  {store.projectFiles.length}
                </Badge>
              )}
            </Button>
            <Button
              variant={activeTab === 'preview' ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveTab('preview')}
            >
              <Eye className="w-3 h-3 mr-1" />
              Preview
            </Button>
            <div className="flex-1" />
            {store.projectFiles.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-zinc-400 hover:text-emerald-400 h-7"
                onClick={updatePreview}
              >
                <Play className="w-3 h-3 mr-1" />
                Run
              </Button>
            )}
          </div>

          {/* ─── Code Editor / Preview Content ─────────────── */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && (
              <ScrollArea className="h-full p-4">
                <div className="max-w-[700px] mx-auto">
                  {store.messages.map((msg) => (
                    <div key={msg.id} className={`mb-3 rounded-lg ${msg.type === 'user' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                      msg.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                        msg.type === 'system' ? 'bg-zinc-800/50 border border-zinc-700/30' :
                          msg.type === 'file' ? 'bg-blue-500/10 border border-blue-500/20' :
                            msg.type === 'thinking' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                              msg.type === 'summary' ? 'bg-emerald-500/15 border border-emerald-500/30' :
                                'bg-zinc-900/50 border border-zinc-800/50'
                      } px-4 py-3`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        {msg.type === 'user' && <Send className="w-3.5 h-3.5 text-emerald-400" />}
                        {msg.type === 'agent' && <Bot className="w-3.5 h-3.5 text-violet-400" />}
                        {msg.type === 'system' && <Cpu className="w-3.5 h-3.5 text-zinc-400" />}
                        {msg.type === 'file' && <FileCode className="w-3.5 h-3.5 text-blue-400" />}
                        {msg.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                        {msg.type === 'thinking' && <Brain className="w-3.5 h-3.5 text-yellow-400" />}
                        {msg.type === 'summary' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        <span className="text-xs font-medium text-zinc-300">
                          {msg.type === 'user' ? 'You' :
                            msg.type === 'file' ? msg.filename || 'File' :
                              msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}
                        </span>
                      </div>
                      <div className={`text-sm ${msg.type === 'thinking' ? 'text-yellow-300/80 italic' :
                        msg.type === 'summary' ? 'text-emerald-300' :
                          msg.type === 'error' ? 'text-red-300' :
                            'text-zinc-200'
                        }`}>
                        {msg.type === 'thinking' ? (
                          <pre className="whitespace-pre-wrap text-xs">{msg.content}</pre>
                        ) : msg.type === 'file' ? (
                          <button
                            className="flex items-center gap-2 hover:opacity-80 text-blue-300"
                            onClick={() => {
                              store.setSelectedFile(msg.filename || null)
                              setActiveTab('files')
                            }}>
                            <span className="font-mono">{msg.filename}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {renderStreamOutput()}
                </div>
              </ScrollArea>
            )}

            {activeTab === 'files' && (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Show Diff Viewer if pending edits exist */}
                {store.pendingEdits.length > 0 ? (
                  <div className="flex-1 overflow-auto p-4 space-y-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-200">
                        Review Proposed Changes ({store.pendingEdits.filter(e => e.status === 'pending').length} pending)
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Accept all pending edits
                          store.pendingEdits
                            .filter(e => e.status === 'pending')
                            .forEach(edit => {
                              store.socket?.emit('edit:accept', edit)
                            })
                        }}
                        className="h-7 text-xs"
                        disabled={store.pendingEdits.filter(e => e.status === 'pending').length === 0}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Accept All
                      </Button>
                    </div>

                    {store.pendingEdits.map((edit) => (
                      <DiffViewer
                        key={edit.editId}
                        edit={edit}
                        onAccept={() => {
                          store.socket?.emit('edit:accept', edit)
                        }}
                        onReject={() => {
                          store.socket?.emit('edit:reject', { editId: edit.editId, filename: edit.filename })
                        }}
                      />
                    ))}

                    {store.pendingEdits.filter(e => e.status === 'pending').length === 0 && (
                      <div className="mt-8 text-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <p className="text-sm text-zinc-400">All changes reviewed!</p>
                        <Button
                          size="sm"
                          onClick={() => {
                            store.clearPendingEdits()
                            setActiveTab('preview')
                          }}
                          className="mt-3"
                        >
                          View Preview
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* File Tabs */}
                    <div className="h-8 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-1 overflow-x-auto shrink-0">
                      {store.projectFiles.map((file) => (
                        <button
                          key={file.filename}
                          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md mr-1 ${store.selectedFile === file.filename
                            ? 'bg-zinc-800 text-emerald-400 border border-zinc-700'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                            }`}
                          onClick={() => store.setSelectedFile(file.filename)}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getFileIconColor(file.language) }} />
                          {file.filename}
                        </button>
                      ))}
                      {store.projectFiles.length === 0 && (
                        <span className="text-xs text-zinc-500">No files yet. Give DevAgent a task to start coding!</span>
                      )}
                    </div>

                    {/* Code Content */}
                    <div className="flex-1 overflow-auto bg-zinc-950">
                      <div className="flex min-h-full">
                        {/* Line Numbers */}
                        <div className="sticky left-0 bg-zinc-900/80 border-r border-zinc-800 px-3 py-4 select-none shrink-0">
                          <div className="text-xs font-mono text-zinc-500 leading-relaxed">
                            {(getSelectedFileContent() || '').split('\n').map((_, index) => (
                              <div key={index} className="text-right">
                                {index + 1}
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Code Content */}
                        <pre className="flex-1 p-4 text-xs font-mono text-zinc-200 leading-relaxed whitespace-pre">
                          {getSelectedFileContent() || 'Select a file to view its content'}
                        </pre>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="h-full bg-white relative">
                {store.projectFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center bg-zinc-950">
                    <Eye className="w-12 h-12 text-zinc-600 mb-4" />
                    <h3 className="text-lg text-zinc-400 mb-2">No Preview Yet</h3>
                    <p className="text-sm text-zinc-500">Give DevAgent a task to build something, then preview it here!</p>
                  </div>
                ) : (
                  <iframe
                    ref={previewRef}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                    title="Preview"
                  />
                )}
              </div>
            )}
          </div>

          {/* ─── BOTTOM PANEL: Terminal ─────────────────────── */}
          <div className="h-[180px] border-t border-zinc-800 flex flex-col bg-zinc-950 shrink-0">
            <div className="h-7 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 shrink-0">
              <Button
                variant={bottomTab === 'terminal' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-5"
                onClick={() => setBottomTab('terminal')}
              >
                <Terminal className="w-3 h-3 mr-1" />
                Terminal
              </Button>
              <Button
                variant={bottomTab === 'logs' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-5"
                onClick={() => setBottomTab('logs')}
              >
                <Code2 className="w-3 h-3 mr-1" />
                Agent Log
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-zinc-500 hover:text-zinc-300 h-5"
                onClick={() => { store.clearTerminalLogs() }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>

            <div ref={terminalRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs">
              {bottomTab === 'terminal' ? (
                store.terminalLogs.map((log, i) => (
                  <div key={i} className={`py-0.5 ${log.includes('❌') ? 'text-red-400' :
                    log.includes('✅') ? 'text-emerald-400' :
                      log.includes('🚀') ? 'text-blue-400' :
                        log.includes('📄') ? 'text-violet-400' :
                          log.includes('💭') ? 'text-yellow-400' :
                            log.includes('🔑') ? 'text-orange-400' :
                              'text-zinc-400'
                    }`}>
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-zinc-400">
                  {store.messages.filter(m => m.type === 'thinking' || m.type === 'system' || m.type === 'summary').map((msg) => (
                    <div key={msg.id} className="py-1 border-b border-zinc-800/50">
                      <span className="text-zinc-500 mr-2">[{msg.type}]</span>
                      <span className={msg.type === 'thinking' ? 'text-yellow-400' : msg.type === 'summary' ? 'text-emerald-400' : 'text-zinc-300'}>
                        {msg.content.slice(0, 200)}
                      </span>
                    </div>
                  ))}
                  {store.streamingText && (
                    <div className="py-1">
                      <span className="text-zinc-500 mr-2">[streaming]</span>
                      <span className="text-emerald-400/70">{store.streamingText.slice(-200)}</span>
                    </div>
                  )}
                </div>
              )}
              {store.terminalLogs.length === 0 && bottomTab === 'terminal' && (
                <div className="text-zinc-600 py-4 text-center">Terminal ready. Start a task to see logs.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SETTINGS MODAL ─────────────────────────────────── */}
      <Dialog open={store.settingsOpen} onOpenChange={store.setSettingsOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              DevAgent Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* ─── Model Selection ─────────────────────────── */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                AI Model (Brain)
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Select the OpenRouter model to use as the AI brain for DevAgent.
              </p>
              <div className="flex gap-2">
                <Input
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="e.g., neotronmon-3-ultra"
                  className="bg-zinc-800 border-zinc-600 text-zinc-100 text-sm"
                />
                <Button
                  onClick={changeModel}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm shrink-0"
                >
                  Apply
                </Button>
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-zinc-500">Quick select:</p>
                <div className="flex gap-1 flex-wrap">
                  {['neotronmon-3-ultra', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.1-405b-instruct'].map((model) => (
                    <button
                      key={model}
                      className={`text-xs px-2 py-1 rounded-md border ${selectedModel === model
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                        }`}
                      onClick={() => setSelectedModel(model)}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Separator className="bg-zinc-700" />

            {/* ─── API Keys ─────────────────────────────────── */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <Key className="w-4 h-4 text-orange-400" />
                OpenRouter API Keys
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Add multiple OpenRouter API keys. When one key hits its limit, DevAgent automatically switches to the next available key.
              </p>

              {/* Current Keys */}
              <div className="space-y-2 mb-4">
                {store.apiKeys.length === 0 ? (
                  <div className="text-xs text-zinc-500 text-center py-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                    No API keys added yet. Add your OpenRouter keys below.
                  </div>
                ) : (
                  store.apiKeys.map((key, index) => (
                    <div key={key.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${key.isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' :
                      key.limitReached ? 'bg-red-500/10 border-red-500/20' :
                        key.isActive ? 'bg-zinc-800/50 border-zinc-700/30' :
                          'bg-zinc-800/30 border-zinc-700/20 opacity-50'
                      }`}>
                      <div className={`w-2 h-2 rounded-full ${key.isCurrent ? 'bg-emerald-400' :
                        key.limitReached ? 'bg-red-400' :
                          key.isActive ? 'bg-zinc-400' :
                            'bg-zinc-600'
                        }`} />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-zinc-200">{key.label}</span>
                        <span className="text-xs text-zinc-500 ml-2 font-mono">{key.key}</span>
                        {key.isCurrent && <Badge className="text-xs ml-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</Badge>}
                        {key.limitReached && <Badge className="text-xs ml-2 bg-red-500/20 text-red-400 border-red-500/30">Limit</Badge>}
                      </div>
                      <span className="text-xs text-zinc-500">{key.requestCount} req</span>
                      <Switch
                        checked={key.isActive}
                        onCheckedChange={(checked) => toggleApiKey(key.id, checked)}
                        className="scale-75"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-red-400 hover:text-red-300 h-6 w-6 p-0"
                        onClick={() => removeApiKey(key.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Key */}
              <div className="flex gap-2">
                <Input
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="bg-zinc-800 border-zinc-600 text-zinc-100 text-sm w-[120px]"
                />
                <Input
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  type="password"
                  className="bg-zinc-800 border-zinc-600 text-zinc-100 text-sm flex-1"
                />
                <Button
                  onClick={addApiKey}
                  disabled={!newApiKey.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>

              {/* Reset Limits */}
              {store.apiKeys.some(k => k.limitReached) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs mt-3 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                  onClick={resetKeyLimits}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reset All Limits
                </Button>
              )}
            </div>

            <Separator className="bg-zinc-700" />

            {/* ─── API Key Status ──────────────────────────── */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Key Rotation Status</h3>
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500">Total Keys</span>
                    <span className="text-zinc-200 font-medium ml-2">{store.apiKeys.length}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Active</span>
                    <span className="text-emerald-400 font-medium ml-2">{store.activeKeyCount}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Limit Reached</span>
                    <span className="text-red-400 font-medium ml-2">{store.apiKeys.filter(k => k.limitReached).length}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  When an API key reaches its rate limit, DevAgent automatically switches to the next available key.
                  Keys rotate in circular order - after all keys are exhausted, limits reset automatically.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
