# Diff Review System Implementation Plan

## Backend Changes Required:

### 1. Propose Edits (Don't Apply)
```typescript
socket.emit('edits:proposed', {
  id: taskId,
  projectPath,
  edits: edits.map(edit => ({
    ...edit,
    editId: unique_id,
    currentContent: fs.readFileSync(...),
    previewContent: calculatePreviewContent(edit)
  }))
})
```

### 2. Accept/Reject Handler
```typescript
socket.on('edit:accept', (data: {editId, filename, action, ...}) => {
  // Apply single edit
  applyEdit(data)
  socket.emit('edit:accepted', {editId, updatedContent})
})

socket.on('edit:reject', (data: {editId}) => {
  socket.emit('edit:rejected', {editId})
})
```

## Frontend Changes Required:

### 1. Diff Viewer Component
- Show line-by-line comparison
- Red background: removed lines
- Green background: added lines
- Side-by-side OR unified view

### 2. Edit Review Panel
- List all proposed edits
- Each edit shows:
  - Filename
  - Action type
  - Diff preview
  - Accept ✅ / Reject ❌ buttons

### 3. State Management
- Store pending edits
- Track accepted/rejected
- Update files after acceptance

This is a complex feature requiring significant changes.
