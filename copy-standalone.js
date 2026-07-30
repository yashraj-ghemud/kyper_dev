const fs = require('fs')
const path = require('path')

// Function to copy directory recursively
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true })
    }

    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath)
        } else {
            fs.copyFileSync(srcPath, destPath)
        }
    }
}

// Copy static files to standalone
try {
    const standaloneDir = path.join(__dirname, '.next/standalone')

    if (fs.existsSync(standaloneDir)) {
        // Copy .next/static to standalone
        const staticSrc = path.join(__dirname, '.next/static')
        const staticDest = path.join(standaloneDir, '.next/static')
        if (fs.existsSync(staticSrc)) {
            copyDir(staticSrc, staticDest)
            console.log('✅ Copied .next/static to standalone')
        }

        // Copy public to standalone
        const publicSrc = path.join(__dirname, 'public')
        const publicDest = path.join(standaloneDir, 'public')
        if (fs.existsSync(publicSrc)) {
            copyDir(publicSrc, publicDest)
            console.log('✅ Copied public to standalone')
        }

        // Copy prisma to standalone
        const prismaSrc = path.join(__dirname, 'prisma')
        const prismaDest = path.join(standaloneDir, 'prisma')
        if (fs.existsSync(prismaSrc)) {
            copyDir(prismaSrc, prismaDest)
            console.log('✅ Copied prisma to standalone')
        }

        // Copy db directory to standalone
        const dbSrc = path.join(__dirname, 'db')
        const dbDest = path.join(standaloneDir, 'db')
        if (fs.existsSync(dbSrc)) {
            copyDir(dbSrc, dbDest)
            console.log('✅ Copied db to standalone')
        } else {
            // Create empty db directory
            fs.mkdirSync(dbDest, { recursive: true })
            console.log('✅ Created db directory in standalone')
        }
    }
} catch (error) {
    console.error('❌ Error copying standalone files:', error)
    process.exit(1)
}
