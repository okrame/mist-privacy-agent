const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const Positioner = require('electron-positioner');

dotenv.config();

const isDev = !app.isPackaged;

const agent1SystemPrompt = `
You are a specialized AI assistant trained to analyze text for personal attribute inference and provide detailed analysis.

IMPORTANT: Only include attributes in your JSON output where you can make a reasonable inference. There can be more than one inferred attribute. Skip attributes entirely if there's insufficient evidence.
`;

let llama = null;
let model = null;
let jsonGrammar = null;
let mainWindow;
let tray;
let resizeTimeout = null;

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 650;

const testmodel = "unsloth.llama3b.Q4_K_M.smalljson.gguf";

async function initializeLlama() {
  try {
    if (model && llama) {
      console.log('Model already initialized, reusing existing instance');
      return true;
    }
    const { getLlama } = await import('node-llama-cpp');

    if (llama) {
      console.log('Disposing old Llama instance...');
      await llama.dispose();
    }
    console.log('Creating new Llama instance...');
    llama = await getLlama();
    
    if (model) {
      console.log('Disposing old model...');
      await model.dispose();
    }

    console.log('Loading model from:', path.join(__dirname, '../../models'));
    model = await llama.loadModel({
      modelPath: path.join(
        app.isPackaged 
          ? process.resourcesPath 
          : path.join(__dirname, '../../models'), 
        testmodel
      ),
      contextSize: 1024,
      encoding: 'utf8' 
    });
    console.log('Model loaded successfully');

    jsonGrammar = await llama.getGrammarFor("json");
    await preWarmModel();
    
    console.log('Llama model initialized and pre-warmed successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Llama:', error);
    return false;
  }
}

async function preWarmModel() {
  console.log('Pre-warming model...');
  let sessionObj = null;
  
  try {
    sessionObj = await createNewSession();
    await sessionObj.session.prompt("This is a simple test message.", {
      grammar: jsonGrammar,
    });
    console.log('Model pre-warming complete');
  } catch (error) {
    console.warn('Model pre-warming failed:', error);
  } finally {
    if (sessionObj) {
      await cleanupSession(sessionObj);
    }
  }
}

async function cleanupSession(sessionObj) {
  if (sessionObj.session?.contextSequence) {
    try {
      await sessionObj.session.contextSequence.dispose();
    } catch (e) {
      console.warn('Error disposing context sequence:', e);
    }
  }
  if (sessionObj.context) {
    try {
      await sessionObj.context.dispose();
    } catch (e) {
      console.warn('Error disposing context:', e);
    }
  }
}

async function createNewSession() {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await model.createContext();
  try {
    const sequence = context.getSequence();
    return {
      session: new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: agent1SystemPrompt
      }),
      context: context
    };
  } catch (error) {
    if (context) {
      try {
        await context.dispose();
      } catch (e) {
        console.warn('Error disposing context during error handling:', e);
      }
    }
    throw error;
  }
}

async function runAgent(text, window) {
  const tokenCount = await model.tokenize(text);
  if (tokenCount.length > 1024) {
    throw new Error("Input too long - please reduce length");
  }
  
  console.log('Running agent with text:', text);
  const startTime = process.hrtime.bigint();
  let sessionObj = null;
  
  try {
    sessionObj = await createNewSession();

    let accumulator = '';
    
    const response = await sessionObj.session.prompt(text, {
      grammar: jsonGrammar,
      onTextChunk: (chunk) => {
        // Decode Unicode escape sequences
        const decodedChunk = chunk.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) => 
          String.fromCodePoint(parseInt(hex, 16))
        );
        
        accumulator += decodedChunk;
        try {
          JSON.parse(accumulator);
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: true
          });
        } catch (e) {
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: false
          });
        }
      }
    });

    // Decode the full response before parsing
    const decodedResponse = response.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) => 
      String.fromCodePoint(parseInt(hex, 16))
    );
    
    const endTime = process.hrtime.bigint();
    const inferenceTime = Number(endTime - startTime) / 1e6;
    
    console.log(`Agent inference time: ${inferenceTime.toFixed(2)} ms`);
    console.log('Agent output:', decodedResponse);

    return {
      response: JSON.parse(decodedResponse),
      inferenceTime
    };
  } catch (error) {
    console.error('Error running agent:', error);
    throw error;
  } finally {
    if (sessionObj) {
      await cleanupSession(sessionObj);
    }
  }
}

async function createWindow() {
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
          preload: path.join(__dirname, 'preload.js'),
          webSecurity: true,
          sandbox: true
      }
  });

  // Bind events immediately after window creation
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
    
    try {
        isInitializing = true;
        console.log('6. Beginning model initialization...');
        const modelReady = await initializeLlama();
        console.log('7. Model initialization complete:', modelReady);
        mainWindow.webContents.send('modelStatus', { ready: modelReady });
    } catch (error) {
        console.error('8. Model initialization failed:', error);
        mainWindow.webContents.send('modelStatus', { 
            ready: false, 
            error: error.message 
        });
    } finally {
        isInitializing = false;
    }
});

  try {
      if (isDev) {
          console.log('9. Loading webpack URL:', MAIN_WINDOW_WEBPACK_ENTRY);
          // Add error handling for webpack URL loading
          try {
              await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
              console.log('10. Webpack URL loaded successfully');
          } catch (webpackError) {
              console.error('11. Failed to load webpack URL:', webpackError);
              // Fallback to file loading if webpack fails
              await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
          }
      } else {
          console.log('12. Loading file directly');
          await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      }

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

function createTray() {
  const iconPath = path.join(__dirname, '../../static/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Privacy Analysis', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Privacy Analysis');

  tray.on('click', (event, bounds) => {
    if (process.platform !== 'win32' || !event.ctrlKey) {
      toggleWindow(bounds);
    }
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });
}

function toggleWindow(bounds) {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    const positioner = new Positioner(mainWindow);
    const position = positioner.calculate('trayCenter', bounds);
    mainWindow.setPosition(position.x, position.y);
    mainWindow.show();
  }
}

app.whenReady().then(async () => {
  console.log('15. App ready, creating window...');
  try {
      await createWindow();
      console.log('16. Window created successfully');
      createTray();
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
  //console.log('Received request for model status');
  const status = { ready: model !== null && llama !== null };
  event.reply('modelStatus', status);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('analyzeText', async (event, text) => {
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
  if (model) {
    try {
      await model.dispose();
    } catch (e) {
      console.warn('Error disposing model:', e);
    }
  }
  if (llama) {
    try {
      await llama.dispose();
    } catch (e) {
      console.warn('Error disposing llama:', e);
    }
  }
});