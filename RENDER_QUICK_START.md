# ⚡ Render Quick Start - 5 Minutes to Deploy

## 🚀 Super Fast Deployment

### Step 1: Push to GitHub (if not done)
```bash
git add .
git commit -m "Ready for Render"
git push origin main
```

### Step 2: Create Services on Render

#### 🌐 Web Service (Frontend)
1. Go to https://dashboard.render.com
2. Click **New +** → **Web Service**
3. Connect GitHub repo: `kyper_dev`
4. Settings:
   - **Name**: `kyper-dev-frontend`
   - **Environment**: `Node`
   - **Build**: `npm install && npm run db:generate && npm run build`
   - **Start**: `npm run start:production`
   - **Plan**: Free
5. Environment Variables:
   ```
   DATABASE_URL=file:./db/custom.db
   NODE_ENV=production
   NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3003
   ```
6. Click **Create Web Service**

#### ⚙️ Worker Service (Agent Backend)
1. Click **New +** → **Background Worker**
2. Connect same repo: `kyper_dev`
3. Settings:
   - **Name**: `kyper-dev-agent-service`
   - **Environment**: `Node`
   - **Build**: `cd mini-services/agent-service && npm install && cd ../.. && npm run db:generate`
   - **Start**: `cd mini-services/agent-service && node index.js`
   - **Plan**: Free
4. Environment Variables:
   ```
   DATABASE_URL=file:../../db/custom.db
   PORT=3003
   NODE_ENV=production
   ```
5. Click **Create Background Worker**

### Step 3: Connect Services

1. Copy worker URL from worker dashboard
   - Example: `https://kyper-dev-agent-service.onrender.com`
2. Go to Web Service → Environment
3. Update `NEXT_PUBLIC_AGENT_SERVICE_URL` with worker URL
4. Save and redeploy

### Step 4: Add API Keys

1. Open your deployed app URL
2. Click **Settings** ⚙️
3. Add OpenRouter API keys
4. Done! 🎉

---

## ✅ Verify Deployment

- [ ] Web service shows "Service Live" (green)
- [ ] Worker shows "Service Live" (green)
- [ ] Open web URL - app loads
- [ ] Add API key in settings
- [ ] Test: "Create a calculator"
- [ ] Preview works

---

## 🐛 Quick Fixes

**❌ Can't connect to agent:**
- Update `NEXT_PUBLIC_AGENT_SERVICE_URL` in web service
- Use worker's full URL: `https://your-worker.onrender.com`

**❌ Build fails:**
- Check Node version (20+)
- Clear build cache
- Redeploy

**❌ Worker not running:**
- Check worker logs
- Verify environment variables
- Restart worker

---

## 📖 Full Guide

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

Made with 💚 by Yashraj Ghemud
