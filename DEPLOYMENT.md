# 🚀 Render Deployment Guide - Kyper Dev

Complete step-by-step guide to deploy Kyper Dev on Render.

---

## 📋 Prerequisites

1. **GitHub Account** - Your code should be pushed to GitHub
2. **Render Account** - Sign up at [render.com](https://render.com)
3. **OpenRouter API Keys** - Get from [openrouter.ai](https://openrouter.ai/settings/keys)

---

## 🎯 Deployment Architecture

Kyper Dev requires **TWO services** on Render:

1. **Web Service** - Next.js Frontend (Port 3000)
2. **Background Worker** - Socket.IO Agent Service (Port 3003)

---

## 📦 Method 1: One-Click Deploy with render.yaml

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### Step 2: Create New Blueprint

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository: `kyper_dev`
4. Render will auto-detect `render.yaml`
5. Click **"Apply"**

### Step 3: Configure Environment Variables

After services are created, add these environment variables:

**For Web Service (`kyper-dev-frontend`):**
- `DATABASE_URL` = `file:./db/custom.db`
- `NEXT_PUBLIC_AGENT_SERVICE_URL` = `https://kyper-dev-agent-service.onrender.com` *(Update with your worker URL)*
- `NODE_ENV` = `production`

**For Worker Service (`kyper-dev-agent-service`):**
- `DATABASE_URL` = `file:../../db/custom.db`
- `PORT` = `3003`
- `NODE_ENV` = `production`

### Step 4: Get Worker URL

1. Go to your worker service dashboard
2. Copy the service URL (e.g., `https://kyper-dev-agent-service.onrender.com`)
3. Update `NEXT_PUBLIC_AGENT_SERVICE_URL` in the web service with this URL

### Step 5: Redeploy

1. Click **"Manual Deploy"** → **"Deploy latest commit"** on web service
2. Wait for deployment to complete

---

## 🛠️ Method 2: Manual Deployment

### Step 1: Create Web Service

1. Go to Render Dashboard
2. Click **"New +"** → **"Web Service"**
3. Connect GitHub repository
4. Configure:
   - **Name**: `kyper-dev-frontend`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Environment**: `Node`
   - **Build Command**: 
     ```bash
     npm install && npm run db:generate && npm run build
     ```
   - **Start Command**: 
     ```bash
     npm run start:production
     ```
   - **Plan**: Free or Starter

5. Add Environment Variables (see Step 3 above)

6. Click **"Create Web Service"**

### Step 2: Create Background Worker

1. Click **"New +"** → **"Background Worker"**
2. Connect same GitHub repository
3. Configure:
   - **Name**: `kyper-dev-agent-service`
   - **Region**: Same as web service
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Environment**: `Node`
   - **Build Command**: 
     ```bash
     cd mini-services/agent-service && npm install && cd ../.. && npm run db:generate
     ```
   - **Start Command**: 
     ```bash
     cd mini-services/agent-service && node index.js
     ```
   - **Plan**: Free or Starter

4. Add Environment Variables (see Step 3 above)

5. Click **"Create Background Worker"**

### Step 3: Connect Services

1. Copy worker URL from worker service dashboard
2. Go to web service → Environment
3. Update `NEXT_PUBLIC_AGENT_SERVICE_URL` with worker URL
4. Click **"Save Changes"**
5. Redeploy web service

---

## ✅ Post-Deployment Setup

### 1. Verify Services Are Running

**Check Web Service:**
- Go to your web service URL (e.g., `https://kyper-dev-frontend.onrender.com`)
- You should see the Kyper Dev interface

**Check Worker Service:**
- Go to worker logs
- Look for: `✅ Agent Service running on port 3003`

### 2. Add API Keys

1. Open your deployed app
2. Click **Settings** button
3. Add your OpenRouter API keys
4. Keys are stored in SQLite database (persistent)

### 3. Test the App

1. Type a task: `"Create a simple calculator"`
2. Watch the agent generate code
3. View live preview

---

## 🔧 Troubleshooting

### ❌ "Cannot connect to agent service"

**Solution:**
1. Check worker is running (green status in Render dashboard)
2. Verify `NEXT_PUBLIC_AGENT_SERVICE_URL` is correct
3. Make sure worker URL is accessible (test in browser)
4. Check CORS settings in `mini-services/agent-service/index.js`

### ❌ Database errors

**Solution:**
1. Make sure `DATABASE_URL` environment variable is set
2. Check build logs for Prisma generation errors
3. Run manual migration: 
   ```bash
   npm run db:push
   ```

### ❌ Build fails

**Solution:**
1. Check Node version (should be 20+)
2. Clear build cache in Render dashboard
3. Check build logs for specific errors
4. Make sure all dependencies are in `package.json`

### ❌ Worker not starting

**Solution:**
1. Check worker logs for errors
2. Verify `index.js` exists in `mini-services/agent-service/`
3. Make sure PORT environment variable is set
4. Check if database is accessible

---

## 📊 Monitoring

### Health Checks

**Web Service:**
- Health endpoint: `/`
- Should return Next.js app

**Worker Service:**
- Check logs for connection messages
- Look for: `Client connected: [socket-id]`

### Logs

View logs in Render dashboard:
1. Select service
2. Go to **"Logs"** tab
3. Filter by type (Info, Error, Warning)

---

## 🔄 Updates & Redeployment

### Auto-Deploy (Recommended)

1. Push changes to GitHub
   ```bash
   git add .
   git commit -m "Update features"
   git push origin main
   ```
2. Render auto-deploys (if enabled)

### Manual Deploy

1. Go to service dashboard
2. Click **"Manual Deploy"**
3. Select **"Deploy latest commit"**

---

## 💰 Cost Optimization

### Free Tier

Render Free tier includes:
- ✅ Web Service: 750 hours/month
- ✅ Background Worker: 750 hours/month
- ⚠️ Sleeps after 15 min of inactivity
- ⚠️ Cold starts (10-30 seconds)

### Starter Tier ($7/month each)

- ✅ Always on (no sleep)
- ✅ Faster performance
- ✅ More compute resources

---

## 🔒 Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use environment variables** for all sensitive data
3. **Rotate API keys** regularly
4. **Monitor usage** in OpenRouter dashboard
5. **Set rate limits** if possible

---

## 📱 Custom Domain (Optional)

### Add Custom Domain

1. Go to web service → Settings
2. Scroll to **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Follow DNS configuration steps
5. Wait for SSL certificate (auto-generated)

---

## 🎉 Success Checklist

- [ ] Both services deployed and running (green status)
- [ ] Web service URL is accessible
- [ ] Worker service shows connection logs
- [ ] Environment variables configured
- [ ] API keys added via UI
- [ ] Test task completes successfully
- [ ] Live preview works
- [ ] Files are generated and saved

---

## 📞 Support

If you encounter issues:

1. Check [Render Status](https://status.render.com/)
2. Review [Render Docs](https://render.com/docs)
3. Check project logs
4. Open GitHub issue: [kyper_dev/issues](https://github.com/yashraj-ghemud/kyper_dev/issues)

---

## 🔗 Useful Links

- **Render Dashboard**: https://dashboard.render.com
- **OpenRouter**: https://openrouter.ai
- **GitHub Repo**: https://github.com/yashraj-ghemud/kyper_dev
- **Documentation**: See README.md

---

<div align="center">

### 🎊 Congratulations! Your AI Coding Agent is Live! 🎊

Made with 💚 by Yashraj Ghemud

</div>
