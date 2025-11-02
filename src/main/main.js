const { app, ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const { initializeLlama, runAgent, dispose, getModelStatus, stopInference } = require('./services/llama');
const { createWindow, getMainWindow, setQuitting } = require('./services/window');
const { createTray } = require('./services/tray');
const { initializeLlama2, runPrivacyAgent, dispose: disposePrivacy, getModel2Status } = require('./services/llama2');
const { ensureModelsReady } = require('./modelsInstaller');
app.commandLine.appendSwitch('js-flags', '--expose-gc');

dotenv.config();

const isDev = !app.isPackaged;

async function handleWindowCreated(window) {
  try {
    console.log('6. Beginning models initialization...');

    if (!isDev) {
      console.log('Checking models (packaged build)…');
      try {
        await ensureModelsReady(window);
      } catch (e) {
        console.error('Model install failed:', e);
        try { window.webContents.send('models:error', String(e?.message || e)); } catch { }
        throw e; 
      }
    }

    console.log('Initializing Agent1 model...');
    const modelReady = await initializeLlama();
    window.webContents.send('modelStatus', { ready: modelReady });

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Initializing Agent2 model...');
    const privacyModelReady = await initializeLlama2();
    window.webContents.send('privacyModelStatus', { ready: privacyModelReady });

    console.log('7. Both models initialized');
  } catch (error) {
    console.error('8. Model initialization failed:', error);
    window.webContents.send('modelStatus', { ready: false, error: error.message });
  }
}

app.whenReady().then(async () => {
  console.log('15. App ready, creating window...');
  try {

    const rendererPath = isDev 
      ? 'http://localhost:5173' 
      : path.join(__dirname, '../../renderer/index.html');
    
    const window = await createWindow(isDev, rendererPath, handleWindowCreated);
    console.log('16. Window created successfully');
    createTray(window); 
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
    const rendererPath = isDev 
      ? 'http://localhost:5173'
      : path.join(__dirname, '../../renderer/index.html');
    const window = await createWindow(isDev, rendererPath, handleWindowCreated);
    createTray(window);  
  }
});

ipcMain.on('getPrivacyModelStatus', (event) => {
  const status = getModel2Status();
  event.reply('privacyModelStatus', status);
});

ipcMain.handle('processPrivacy', async (event, { text, attributes, analyzedPhrases }) => {
  const mainWindow = getMainWindow();
  try {
    const result = await runPrivacyAgent(text, attributes, analyzedPhrases, mainWindow);
    // The chunks are now being sent via the privacyChunk event in llama2.js
    mainWindow.webContents.send('privacyComplete', {
      success: true,
      data: result
    });
    return result;
  } catch (error) {
    mainWindow.webContents.send('privacyError', {
      success: false,
      error: error.message
    });
    throw error;
  }
});

ipcMain.handle('analyzeText', async (event, text) => {
  const mainWindow = getMainWindow();
  try {
    mainWindow.webContents.send('analysisStateChange', { isAnalyzing: true });

    const result = await runAgent(text, mainWindow);
    if (result) {
      mainWindow.webContents.send('analysisComplete', {
        success: true,
        data: result
      });
      return result;
    }
  } catch (error) {
    console.error('Analysis error in main process:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    mainWindow.webContents.send('analysisError', {
      success: false,
      error: errorMessage
    });
    throw new Error(errorMessage);
  } finally {
    mainWindow.webContents.send('analysisStateChange', { isAnalyzing: false });
  }
});

ipcMain.handle('stopAnalysis', async () => {
  const mainWindow = getMainWindow();
  try {
    console.log('Stopping analysis...');
    mainWindow.webContents.send('analysisStateChange', { isPostStop: true });

    await Promise.all([
      stopInference(),
      new Promise((resolve) => {
        const completeHandler = () => {
          mainWindow.webContents.removeListener('analysisComplete', completeHandler);
          mainWindow.webContents.removeListener('analysisError', errorHandler);
          resolve();
        };
        const errorHandler = () => {
          mainWindow.webContents.removeListener('analysisComplete', completeHandler);
          mainWindow.webContents.removeListener('analysisError', errorHandler);
          resolve();
        };
        mainWindow.webContents.once('analysisComplete', completeHandler);
        mainWindow.webContents.once('analysisError', errorHandler);
      }),
    ]);

    console.log('Analysis fully stopped. Resetting isPostStop.');
    mainWindow.webContents.send('analysisStateChange', { isPostStop: false });

    return true;
  } catch (error) {
    console.error('Error stopping analysis:', error);
    mainWindow.webContents.send('analysisError', { success: false, error: error.message });

    console.log('Forcing isPostStop reset due to error.');
    mainWindow.webContents.send('analysisStateChange', { isPostStop: false });

    return false;
  }
});

app.on('before-quit', () => {
  console.log('App is quitting, allowing window close...');
  setQuitting(true);
});

app.on('will-quit', async (event) => {
  console.log('Disposing models before quit...');
  event.preventDefault();
  
  try {
    await Promise.all([
      dispose(),
      disposePrivacy()
    ]);
    console.log('Models disposed successfully');
  } catch (error) {
    console.error('Error disposing models:', error);
  } finally {
    app.exit(0);
  }
});