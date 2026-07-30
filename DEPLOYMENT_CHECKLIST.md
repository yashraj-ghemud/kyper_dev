# ✅ Render Deployment Checklist

Quick verification checklist before and after deployment.

---

## 📋 Pre-Deployment Checklist

Before pushing to GitHub and deploying:

- [x] ✅ Code is in GitHub repository
- [x] ✅ `.gitignore` configured (node_modules, .env, .next excluded)
- [x] ✅ `render.yaml` configuration file created
- [x] ✅ `server.js` for production Next.js server
- [x] ✅ `copy-standalone.js` for build process
- [x] ✅ `index.js` (Node.js version) for agent service
- [x] ✅ Environment variables documented (`.env.example`)
- [x] ✅ Build scripts updated in `package.json`
- [x] ✅ Database schema ready (`prisma/schema.prisma`)
- [x] ✅ Socket.IO URL uses environment variable
- [x] ✅ CORS configured for production
- [x] ✅ Node version specified (`.nvmrc` = 20.11.0)
- [x] ✅ Deployment guides created

---

## 🚀 Deployment Steps

### 1️⃣ Create Render Account
- [ ] Sign up at https://render.com
- [ ] Connect GitHub account

### 2️⃣ Deploy Web Service
- [ ] Create new Web Service
- [ ] Connect `kyper_dev` repository
- [ ] Set build command: `npm install && npm run db:generate && npm run build`
- [ ] Set start command: `npm run start:production`
- [ ] Add environment variables:
  - [ ] `DATABASE_URL=file:./db/custom.db`
  - [ ] `NODE_ENV=production`
  - [ ] `NEXT_PUBLIC_AGENT_SERVICE_URL` (update after worker created)

### 3️⃣ Deploy Worker Service
- [ ] Create new Background Worker
- [ ] Connect same `kyper_dev` repository
- [ ] Set build command: `cd mini-services/agent-service && npm install && cd ../.. && npm run db:generate`
- [ ] Set start command: `cd mini-services/agent-service && node index.js`
- [ ] Add environment variables:
  - [ ] `DATABASE_URL=file:../../db/custom.db`
  - [ ] `PORT=3003`
  - [ ] `NODE_ENV=production`

### 4️⃣ Connect Services
- [ ] Copy worker service URL
- [ ] Update `NEXT_PUBLIC_AGENT_SERVICE_URL` in web service
- [ ] Redeploy web service

---

## ✅ Post-Deployment Verification

### Web Service Health
- [ ] Service status shows "Live" (green indicator)
- [ ] Build completed successfully (check logs)
- [ ] No build errors in logs
- [ ] Web URL opens successfully
- [ ] UI loads correctly (no blank page)
- [ ] Console shows no critical errors (F12 developer tools)

### Worker Service Health
- [ ] Service status shows "Live" (green indicator)
- [ ] Logs show: `✅ Agent Service running on port 3003`
- [ ] Logs show: `Loaded X API keys`
- [ ] No connection errors in logs

### Connectivity Test
- [ ] Open web app in browser
- [ ] Check browser console for connection message
- [ ] Should see: `Client connected: [socket-id]` in worker logs
- [ ] Connection indicator shows "Connected" (green)

### Functionality Test
- [ ] Settings panel opens
- [ ] Can add API key
- [ ] API key saves successfully
- [ ] Can type message in chat
- [ ] Test prompt: `"Create a hello world HTML page"`
- [ ] Agent starts responding (see "Agent Running..." indicator)
- [ ] Files appear in Files tab
- [ ] Preview tab shows generated HTML
- [ ] Task completes successfully

### Database Test
- [ ] API keys persist after refresh
- [ ] Projects are saved
- [ ] Can view project history
- [ ] Files are retrievable

---

## 🔧 Configuration Verification

### Environment Variables - Web Service
```bash
✅ DATABASE_URL=file:./db/custom.db
✅ NODE_ENV=production
✅ NEXT_PUBLIC_AGENT_SERVICE_URL=https://[your-worker].onrender.com
```

### Environment Variables - Worker Service
```bash
✅ DATABASE_URL=file:../../db/custom.db
✅ PORT=3003
✅ NODE_ENV=production
```

---

## 🐛 Troubleshooting Checks

### If Web Service Fails
- [ ] Check build logs for errors
- [ ] Verify Node version (should be 20.11.0)
- [ ] Check if `npm install` completed
- [ ] Verify Prisma client generated
- [ ] Check if `server.js` exists
- [ ] Clear build cache and retry

### If Worker Fails
- [ ] Check worker logs for errors
- [ ] Verify `index.js` exists in mini-services/agent-service
- [ ] Check if database is accessible
- [ ] Verify PORT environment variable
- [ ] Check if Socket.IO server started

### If Connection Fails
- [ ] Verify `NEXT_PUBLIC_AGENT_SERVICE_URL` is correct
- [ ] Check if worker URL is accessible (try in browser)
- [ ] Verify CORS settings in agent service
- [ ] Check browser console for errors
- [ ] Verify worker is running (check status)

### If Agent Doesn't Respond
- [ ] Check if API keys are added
- [ ] Verify API keys are valid (check OpenRouter dashboard)
- [ ] Check worker logs for API errors
- [ ] Verify key rotation is working
- [ ] Test with a simple prompt first

---

## 📊 Performance Metrics

### Expected Response Times
- **Cold Start (Free Tier)**: 10-30 seconds first request
- **Warm Response**: < 5 seconds
- **Agent Response**: 20-60 seconds (depends on task complexity)
- **File Generation**: Instant after agent completes

### Resource Usage
- **Web Service**: ~100-300 MB RAM
- **Worker Service**: ~100-200 MB RAM
- **Database**: < 10 MB (grows with projects)

---

## 🎯 Success Criteria

All of these should be ✅:

- [ ] Both services deployed and running
- [ ] Web URL accessible and loads UI
- [ ] Worker logs show successful startup
- [ ] Can connect to agent service
- [ ] Can add and manage API keys
- [ ] Can submit tasks and get responses
- [ ] Files are generated correctly
- [ ] Preview works for HTML/CSS/JS
- [ ] Projects are saved in database
- [ ] No critical errors in logs
- [ ] All features work as expected

---

## 📞 Support Resources

**If something doesn't work:**

1. ✅ Review this checklist
2. 📖 Check [DEPLOYMENT.md](./DEPLOYMENT.md)
3. ⚡ Try [RENDER_QUICK_START.md](./RENDER_QUICK_START.md)
4. 🔍 Search [Render Docs](https://render.com/docs)
5. 📝 Check [Render Status](https://status.render.com/)
6. 🐛 Open [GitHub Issue](https://github.com/yashraj-ghemud/kyper_dev/issues)

---

## 🎉 Deployment Complete!

Once all items are checked ✅, your Kyper Dev AI agent is live and ready to code! 🚀

Share your deployed app and start building amazing projects with AI! 💚

---

<div align="center">

**Made with 💚 by Yashraj Ghemud**

[GitHub](https://github.com/yashraj-ghemud/kyper_dev) • [Deployment Guide](./DEPLOYMENT.md) • [Quick Start](./RENDER_QUICK_START.md)

</div>
