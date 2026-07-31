# 🐘 PostgreSQL Setup Guide for Render

## ✅ Why PostgreSQL?

- ✅ **FREE on Render** (1GB storage, 30 days)
- ✅ **Data persists** across deploys (unlike SQLite on free tier)
- ✅ **Production-ready** and scalable
- ✅ **Fully managed** by Render

---

## 🚀 Quick Setup on Render

### Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   ```
   Name: kyper-dev-db
   Database: kyper_dev
   User: kyper_dev_user
   Region: Same as your services (Oregon)
   Instance Type: Free
   ```
4. Click **"Create Database"**
5. Wait 2-3 minutes for provisioning

### Step 2: Copy Database URL

1. PostgreSQL dashboard will open
2. Scroll to **"Connections"** section
3. Copy **"Internal Database URL"** (starts with `postgresql://`)
4. Example: `postgresql://kyper_dev_user:xxxxx@dpg-xxxxx/kyper_dev`

---

## 🔧 Configure Services

### Frontend Service Environment Variables

1. Go to **kyper-dev-frontend** → Settings → Environment
2. Update/Add:
   ```
   DATABASE_URL = (paste your PostgreSQL Internal URL)
   NODE_ENV = production
   NEXT_PUBLIC_AGENT_SERVICE_URL = (your agent URL)
   ```
3. Save Changes

### Agent Service Environment Variables

1. Go to **kyper-dev-agent** → Settings → Environment
2. Update/Add:
   ```
   DATABASE_URL = (paste your PostgreSQL Internal URL)
   PORT = 3003
   NODE_ENV = production
   ```
3. Save Changes

---

## 📦 Update Build Commands

### Frontend Service

```
Build Command:
npm install && npx prisma generate --schema=./prisma/schema.prisma && npx prisma db push && npm run build

Start Command:
npm run start:production
```

### Agent Service

```
Build Command:
npm install && npx prisma generate --schema=./prisma/schema.prisma && npx prisma db push

Start Command:
node agent-server.js
```

**Note:** `prisma db push` creates tables automatically on first deploy!

---

## 🔄 Redeploy Services

1. **Frontend**: Manual Deploy → Deploy latest commit
2. **Agent**: Manual Deploy → Deploy latest commit
3. Wait 5-10 minutes
4. Both services should be **Live** (green)

---

## ✅ Verify Database

1. PostgreSQL dashboard → **"Connect"** tab
2. Click **"Connect to database"**
3. Run query to check tables:
   ```sql
   \dt
   ```
4. Should see: `ApiKey`, `Project`, `ProjectFile`, `AgentTask`

---

## 🎉 Done!

Your Kyper Dev is now running on PostgreSQL!

**Benefits:**
- ✅ Data persists forever (until 30-day free trial expires)
- ✅ Faster than SQLite
- ✅ Production-ready
- ✅ No file system issues

---

## 💡 Free Tier Limits

- **Storage**: 1GB (plenty for API keys & projects)
- **Duration**: 30 days, then 14-day grace period
- **After expiry**: Upgrade to paid ($7/month) or database deleted

---

## 🔄 Extending Free Trial

After 30 days:
1. Create new free PostgreSQL database
2. Copy new DATABASE_URL
3. Update both services
4. Redeploy

**Or upgrade to Starter plan ($7/month) for permanent database.**

---

## 🐛 Troubleshooting

### ❌ "Can't reach database"
- Use **Internal Database URL** (not External)
- Check DATABASE_URL is set correctly
- Verify database is "Available" (green)

### ❌ "Relation does not exist"
- Run `npx prisma db push` in build command
- Or manually: Connect to DB → Run migrations

### ❌ Build fails
- Check Prisma schema is correct (postgresql provider)
- Ensure DATABASE_URL is set before build
- Clear build cache and retry

---

<div align="center">

**Made with 💚 by Yashraj Ghemud**

[Back to Main README](./README.md) • [Quick Start](./RENDER_QUICK_START.md)

</div>
