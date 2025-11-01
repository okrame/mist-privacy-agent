#!/bin/bash

set -e

echo "🚀 Building Mist Privacy Agent"
echo "=============================================="

# Get project name and product name from package.json
PROJECT_NAME=$(node -p "require('./package.json').name")
PRODUCT_NAME=$(node -p "require('./package.json').productName || require('./package.json').name")

echo "📋 Project: $PROJECT_NAME"
echo "📋 Product: $PRODUCT_NAME"
echo ""

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf out/
echo "   ✓ Clean complete"
echo ""

# Step 2: Rebuild native modules for Electron
echo "🔧 Rebuilding native modules for Electron..."
npm run postinstall || {
    echo "⚠️  Warning: Could not rebuild with electron-builder"
    echo "   Trying with electron-rebuild..."
    npx electron-rebuild -f || {
        echo "❌ Failed to rebuild native modules"
        echo "   The app may crash on launch!"
    }
}
echo "   ✓ Native modules rebuilt"
echo ""

# Step 3: Backup package.json and remove models from extraResource
echo "📦 Preparing package configuration..."
cp package.json package.json.bak
cat package.json.bak | sed 's/"models"//g' | sed 's/\[,/[/g' | sed 's/,\]/]/g' > package.json.tmp
mv package.json.tmp package.json
echo "   ✓ Configuration prepared"
echo ""

# Step 4: Run Electron Forge package
echo "📦 Packaging with Electron Forge..."
npm run package

# Restore original package.json
mv package.json.bak package.json
echo ""
echo "✅ Package created!"
echo ""

# Step 5: Find the packaged app
ARCH=$(uname -m)
APP_DIR=""

# Try to find with productName first
if [ "$ARCH" = "arm64" ]; then
    if [ -d "out/${PRODUCT_NAME}-darwin-arm64" ]; then
        APP_DIR="out/${PRODUCT_NAME}-darwin-arm64"
    elif [ -d "out/${PROJECT_NAME}-darwin-arm64" ]; then
        APP_DIR="out/${PROJECT_NAME}-darwin-arm64"
    fi
elif [ "$ARCH" = "x86_64" ]; then
    if [ -d "out/${PRODUCT_NAME}-darwin-x64" ]; then
        APP_DIR="out/${PRODUCT_NAME}-darwin-x64"
    elif [ -d "out/${PROJECT_NAME}-darwin-x64" ]; then
        APP_DIR="out/${PROJECT_NAME}-darwin-x64"
    fi
fi

# Fallback: find any darwin directory
if [ -z "$APP_DIR" ]; then
    APP_DIR=$(find out -maxdepth 1 -name "*-darwin-*" -type d | head -n 1)
fi

if [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then
    echo "📁 Found packaged app at: $APP_DIR"
    
    # Find the .app bundle
    APP_BUNDLE=$(find "$APP_DIR" -name "*.app" -maxdepth 1 | head -n 1)
    
    if [ -z "$APP_BUNDLE" ]; then
        echo "❌ Could not find .app bundle in $APP_DIR"
        exit 1
    fi
    
    echo "📱 App bundle: $APP_BUNDLE"
    echo ""
    
    # Step 6: Copy models if available
    if [ -d "models" ]; then
        echo "📂 Adding models to the app..."
        mkdir -p "$APP_BUNDLE/Contents/Resources/models"
        echo "   Copying models (this may take a few minutes)..."
        cp -r models/* "$APP_BUNDLE/Contents/Resources/models/" && {
            echo "   ✓ Models copied successfully"
        } || {
            echo "⚠️  Warning: Failed to copy models"
            echo "   You can copy them manually to:"
            echo "   $APP_BUNDLE/Contents/Resources/models/"
        }
    else
        echo "⚠️  No 'models' directory found"
        echo "   Download models and place them in:"
        echo "   $APP_BUNDLE/Contents/Resources/models/"
    fi
    
    echo ""
    echo "🎉 Build complete!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 App location:"
    echo "   $APP_BUNDLE"
    echo ""
    echo "🧪 To test the app:"
    echo "   open \"$APP_BUNDLE\""
    echo ""
    echo "📦 To create a distributable ZIP:"
    echo "   cd \"$APP_DIR\""
    echo "   zip -r -y ../mist-macos.zip *.app"
    echo ""
    echo "🔍 To check native modules:"
    echo "   otool -L \"$APP_BUNDLE/Contents/Resources/app.asar.unpacked/node_modules/node-llama-cpp/bins/osx-arm64/llama-addon.node\""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
else
    echo "❌ Package not found"
    echo "Looking for any built packages..."
    find out -name "*.app" -type d 2>/dev/null || echo "No .app bundles found"
    exit 1
fi