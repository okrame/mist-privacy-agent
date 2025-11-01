const { BrowserWindow } = require('electron');
const path = require('path');

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 650;
const DEFAULT_HEIGHT = 300;

let mainWindow;

async function createWindow(isDev, MAIN_WINDOW_WEBPACK_ENTRY, onWindowCreated) {
  console.log('1. Starting window creation...');
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
          //preload: path.join(__dirname, '../../.webpack/main/preload.js'),
          preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
          webSecurity: true,
          sandbox: true,
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

  // Move the model initialization logic here
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
      console.log('Loading renderer via MAIN_WINDOW_WEBPACK_ENTRY:', MAIN_WINDOW_WEBPACK_ENTRY);
      await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);   // <-- works in dev and prod

      // ensure the window actually becomes visible
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