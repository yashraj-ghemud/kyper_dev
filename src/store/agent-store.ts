import { create } from 'zustand'

export interface ProjectFile {
  filename: string
  content: string
  language: string
}

export interface PendingEdit {
  editId: string
  filename: string
  action: string
  currentContent: string
  newContent: string
  startLine?: number
  endLine?: number
  line?: number
  language: string
  projectPath: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface AgentMessage {
  id: string
  type: 'user' | 'agent' | 'system' | 'file' | 'error' | 'thinking' | 'stream' | 'summary'
  content: string
  timestamp: string
  filename?: string
  language?: string
}

export interface ApiKeyInfo {
  id: string
  key: string
  label: string
  isActive: boolean
  isCurrent: boolean
  requestCount: number
  limitReached: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
  status: string
  files: ProjectFile[]
  createdAt: string
}

interface AgentState {
  // Connection
  isConnected: boolean
  socket: any | null

  // Messages / Chat
  messages: AgentMessage[]
  currentTaskId: string | null
  isAgentRunning: boolean
  streamingText: string

  // Files & Editor
  projectFiles: ProjectFile[]
  selectedFile: string | null
  currentProjectId: string | null

  // Pending Edits for Review
  pendingEdits: PendingEdit[]

  // Terminal
  terminalLogs: string[]

  // API Keys
  apiKeys: ApiKeyInfo[]
  currentKeyIndex: number
  currentModel: string
  activeKeyCount: number

  // Projects
  projects: Project[]

  // Settings
  settingsOpen: boolean

  // Actions
  setConnected: (connected: boolean) => void
  setSocket: (socket: any) => void
  addMessage: (message: AgentMessage) => void
  setAgentRunning: (running: boolean) => void
  appendStreamText: (chunk: string) => void
  clearStreamText: () => void
  addProjectFile: (file: ProjectFile) => void
  setSelectedFile: (filename: string | null) => void
  setCurrentProjectId: (id: string | null) => void
  addTerminalLog: (log: string) => void
  setApiKeys: (keys: ApiKeyInfo[], currentKeyIndex: number, activeKeyCount: number) => void
  setCurrentModel: (model: string) => void
  setProjects: (projects: Project[]) => void
  setSettingsOpen: (open: boolean) => void
  resetForNewTask: () => void
  clearProjectFiles: () => void
  clearTerminalLogs: () => void
  clearAll: () => void

  // Pending Edits Actions
  setPendingEdits: (edits: PendingEdit[]) => void
  updateEditStatus: (editId: string, status: 'accepted' | 'rejected') => void
  clearPendingEdits: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  isConnected: false,
  socket: null,
  messages: [],
  currentTaskId: null,
  isAgentRunning: false,
  streamingText: '',
  projectFiles: [],
  selectedFile: null,
  currentProjectId: null,
  pendingEdits: [],
  terminalLogs: [],
  apiKeys: [],
  currentKeyIndex: 0,
  currentModel: 'neotronmon-3-ultra',
  activeKeyCount: 0,
  projects: [],
  settingsOpen: false,

  setConnected: (connected) => set({ isConnected: connected }),
  setSocket: (socket) => set({ socket }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setAgentRunning: (running) => set({ isAgentRunning: running }),
  appendStreamText: (chunk) => set((state) => ({ streamingText: state.streamingText + chunk })),
  clearStreamText: () => set({ streamingText: '' }),
  addProjectFile: (file) => set((state) => ({
    projectFiles: [...state.projectFiles.filter(f => f.filename !== file.filename), file],
    selectedFile: file.filename,
  })),
  setSelectedFile: (filename) => set({ selectedFile: filename }),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  addTerminalLog: (log) => set((state) => ({ terminalLogs: [...state.terminalLogs, log] })),
  setApiKeys: (keys, currentKeyIndex, activeKeyCount) => set({ apiKeys: keys, currentKeyIndex, activeKeyCount }),
  setCurrentModel: (model) => set({ currentModel: model }),
  setProjects: (projects) => set({ projects }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  resetForNewTask: () => set({
    streamingText: '',
    isAgentRunning: false,
  }),
  clearProjectFiles: () => set({ projectFiles: [], selectedFile: null }),
  clearTerminalLogs: () => set({ terminalLogs: [] }),
  clearAll: () => set({
    messages: [],
    projectFiles: [],
    selectedFile: null,
    streamingText: '',
    terminalLogs: [],
    isAgentRunning: false,
    currentTaskId: null,
    pendingEdits: [],
  }),

  // Pending Edits Actions
  setPendingEdits: (edits) => set({ pendingEdits: edits }),
  updateEditStatus: (editId, status) => set((state) => ({
    pendingEdits: state.pendingEdits.map(edit =>
      edit.editId === editId ? { ...edit, status } : edit
    )
  })),
  clearPendingEdits: () => set({ pendingEdits: [] }),
}))
