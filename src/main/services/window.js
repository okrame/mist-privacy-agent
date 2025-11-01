// src/main/services/window.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 650;
const DEFAULT_HEIGHT = 300;

let mainWindow;

async function createWindow(isDev, rendererPath, onWindowCreated) {
    const appRoot = app.isPackaged
        ? app.getAppPath() 
        : path.join(__dirname, '../../'); 


    const preloadPath = isDev
        ? path.join(__dirname, '../../preload/index.js')
        : path.join(appRoot, 'out/preload/index.js');

    console.log('Preload path chosen:', preloadPath);

    mainWindow = new BrowserWindow({
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        show: false,
        frame: false,
        fullscreenable: false,
        resizable: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false,
            preload: preloadPath,
            webSecurity: true,
            sandbox: isDev ? false : false,
            scrollBounce: process.platform === 'darwin'
        }
    });

    console.log('2. Binding window events...');

    mainWindow.webContents.on('dom-ready', () => {
        console.log('3. DOM ready event fired');
    });

    mainWindow.webContents.on('did-start-loading', () => {
        console.log('4. Window started loading');
    });

    let isInitializing = false;
    mainWindow.webContents.on('did-finish-load', async () => {
        console.log('5. Window finished loading');
        if (isInitializing) {
            console.log('Model initialization already in progress, skipping...');
            return;
        }

        if (onWindowCreated) {
            try {
                isInitializing = true;
                await onWindowCreated(mainWindow);
            } finally {
                isInitializing = false;
            }
        }
    });

    try {
        if (isDev) {
            console.log('Loading renderer (dev):', rendererPath);
            await mainWindow.loadURL(rendererPath); 
        } else {
            const rendererIndex = path.join(appRoot, 'out/renderer/index.html');
            console.log('Loading renderer (prod):', rendererIndex);
            await mainWindow.loadFile(rendererIndex); 
        }

        if (!mainWindow.isVisible()) mainWindow.show();

        if (isDev) {
            console.log('13. Opening DevTools');
            mainWindow.webContents.openDevTools({
                mode: 'right',
                activate: true
            });
        }

    } catch (error) {
        console.error('14. Critical error in window creation:', error);
    }

    return mainWindow;
}

function getMainWindow() {
    return mainWindow;
}

function showWindow() {
    if (mainWindow) {
        mainWindow.show();
    }
}

function hideWindow() {
    if (mainWindow) {
        mainWindow.hide();
    }
}

module.exports = {
    createWindow,
    getMainWindow,
    showWindow,
    hideWindow
};