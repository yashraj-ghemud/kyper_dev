'use client'

import { Check, X } from 'lucide-react'
import { Button } from './ui/button'
import { useAgentStore, PendingEdit } from '@/store/agent-store'

interface DiffViewerProps {
    edit: PendingEdit
    onAccept: () => void
    onReject: () => void
}

export function DiffViewer({ edit, onAccept, onReject }: DiffViewerProps) {
    const renderDiff = () => {
        if (edit.action === 'create') {
            return (
                <div className="space-y-1">
                    <div className="text-xs text-zinc-400 mb-2">New file: {edit.filename}</div>
                    {edit.newContent.split('\n').map((line, i) => (
                        <div key={i} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{i + 1}</span>
                            <span className="flex-1 bg-green-500/20 border-l-2 border-green-500 px-2">{line || ' '}</span>
                        </div>
                    ))}
                </div>
            )
        }

        if (edit.action === 'delete') {
            return (
                <div className="space-y-1">
                    <div className="text-xs text-red-400 mb-2">Delete file: {edit.filename}</div>
                    {edit.currentContent.split('\n').slice(0, 10).map((line, i) => (
                        <div key={i} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{i + 1}</span>
                            <span className="flex-1 bg-red-500/20 border-l-2 border-red-500 px-2 line-through opacity-60">{line || ' '}</span>
                        </div>
                    ))}
                    {edit.currentContent.split('\n').length > 10 && (
                        <div className="text-xs text-zinc-500 pl-14">... and {edit.currentContent.split('\n').length - 10} more lines</div>
                    )}
                </div>
            )
        }

        if (edit.action === 'replace' && edit.startLine && edit.endLine) {
            const lines = edit.currentContent.split('\n')
            const beforeLines = lines.slice(Math.max(0, edit.startLine - 3), edit.startLine - 1)
            const removedLines = lines.slice(edit.startLine - 1, edit.endLine)
            const afterLines = lines.slice(edit.endLine, Math.min(lines.length, edit.endLine + 3))

            return (
                <div className="space-y-1">
                    <div className="text-xs text-zinc-400 mb-2">
                        Replace lines {edit.startLine}-{edit.endLine} in {edit.filename}
                    </div>

                    {/* Context before */}
                    {beforeLines.map((line, i) => (
                        <div key={`before-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{edit.startLine! - beforeLines.length + i}</span>
                            <span className="flex-1 px-2 text-zinc-400">{line || ' '}</span>
                        </div>
                    ))}

                    {/* Removed lines */}
                    {removedLines.map((line, i) => (
                        <div key={`removed-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{edit.startLine! + i}</span>
                            <span className="flex-1 bg-red-500/20 border-l-2 border-red-500 px-2 line-through">{line || ' '}</span>
                        </div>
                    ))}

                    {/* New lines */}
                    {edit.newContent.split('\n').map((line, i) => (
                        <div key={`added-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{edit.startLine! + i}</span>
                            <span className="flex-1 bg-green-500/20 border-l-2 border-green-500 px-2">{line || ' '}</span>
                        </div>
                    ))}

                    {/* Context after */}
                    {afterLines.map((line, i) => (
                        <div key={`after-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{edit.endLine! + i + 1}</span>
                            <span className="flex-1 px-2 text-zinc-400">{line || ' '}</span>
                        </div>
                    ))}
                </div>
            )
        }

        if (edit.action === 'append') {
            const lines = edit.currentContent.split('\n')
            const lastLines = lines.slice(-5)

            return (
                <div className="space-y-1">
                    <div className="text-xs text-zinc-400 mb-2">Append to {edit.filename}</div>

                    {/* Last few lines of current file */}
                    {lastLines.map((line, i) => (
                        <div key={`current-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{lines.length - lastLines.length + i + 1}</span>
                            <span className="flex-1 px-2 text-zinc-400">{line || ' '}</span>
                        </div>
                    ))}

                    {/* New lines */}
                    {edit.newContent.split('\n').map((line, i) => (
                        <div key={`added-${i}`} className="flex font-mono text-xs">
                            <span className="w-12 text-right pr-3 text-zinc-600 select-none">{lines.length + i + 1}</span>
                            <span className="flex-1 bg-green-500/20 border-l-2 border-green-500 px-2">{line || ' '}</span>
                        </div>
                    ))}
                </div>
            )
        }

        return <div className="text-xs text-zinc-500">Unsupported action: {edit.action}</div>
    }

    const isPending = edit.status === 'pending'
    const isAccepted = edit.status === 'accepted'
    const isRejected = edit.status === 'rejected'

    return (
        <div className={`border rounded-lg ${isAccepted ? 'border-green-500/50 bg-green-500/5' :
                isRejected ? 'border-red-500/50 bg-red-500/5' :
                    'border-zinc-700 bg-zinc-900/50'
            } p-4`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">{edit.filename}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{edit.action}</span>
                    {isAccepted && <span className="text-xs text-green-400">✓ Accepted</span>}
                    {isRejected && <span className="text-xs text-red-400">✗ Rejected</span>}
                </div>

                {isPending && (
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={onAccept}
                            className="h-7 bg-green-600 hover:bg-green-500 text-white"
                        >
                            <Check className="w-3 h-3 mr-1" />
                            Accept
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onReject}
                            className="h-7 border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                            <X className="w-3 h-3 mr-1" />
                            Reject
                        </Button>
                    </div>
                )}
            </div>

            {/* Diff Content */}
            <div className="bg-zinc-950 rounded-md p-3 max-h-96 overflow-y-auto">
                {renderDiff()}
            </div>
        </div>
    )
}
