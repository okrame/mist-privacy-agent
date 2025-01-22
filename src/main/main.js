const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const { initializeLlama, runAgent, dispose, getModelStatus } = require('./services/llama');
const { createWindow, getMainWindow } = require('./services/window');
const { createTray } = require('./services/tray');

dotenv.config();

const isDev = !app.isPackaged;

async function handleWindowCreated(window) {
    try {
        console.log('6. Beginning model initialization...');
        const modelReady = await initializeLlama();
        console.log('7. Model initialization complete:', modelReady);
        window.webContents.send('modelStatus', { ready: modelReady });
    } catch (error) {
        console.error('8. Model initialization failed:', error);
        window.webContents.send('modelStatus', { 
            ready: false, 
            error: error.message 
        });
    }
}

app.whenReady().then(async () => {
  console.log('15. App ready, creating window...');
  try {
      const window = await createWindow(isDev, MAIN_WINDOW_WEBPACK_ENTRY, handleWindowCreated);
      console.log('16. Window created successfully');
      createTray(window);  // Pass the window instance 
  } catch (error) {
      console.error('17. Failed to create window:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('getModelStatus', (event) => {
  const status = getModelStatus();
  event.reply('modelStatus', status);
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const window = await createWindow(isDev, MAIN_WINDOW_WEBPACK_ENTRY, handleWindowCreated);
    createTray(window);  // Create tray with new window instance
  }
});

ipcMain.handle('analyzeText', async (event, text) => {
  const mainWindow = getMainWindow();
  try {
    const result = await runAgent(text, mainWindow);
    mainWindow.webContents.send('analysisComplete', {
      success: true,
      data: result
    });
  } catch (error) {
    mainWindow.webContents.send('analysisError', {
      success: false,
      error: error.message
    });
  }
});

app.on('before-quit', async () => {
  await dispose();
});