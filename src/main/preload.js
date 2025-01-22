import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('privacyAPI', {
  analyzeText: (text, onChunk) => {
    return new Promise((resolve, reject) => {
      // Setup chunk listener
      const chunkHandler = (_event, chunk) => {
        onChunk(chunk);
      };
      
      // Setup completion listener
      const completionHandler = (_event, result) => {
        ipcRenderer.removeListener('analysisChunk', chunkHandler);
        resolve(result);
      };

      // Setup error listener
      const errorHandler = (_event, error) => {
        ipcRenderer.removeListener('analysisChunk', chunkHandler);
        reject(error);
      };

      // Register listeners
      ipcRenderer.on('analysisChunk', chunkHandler);
      ipcRenderer.once('analysisComplete', completionHandler);
      ipcRenderer.once('analysisError', errorHandler);

      // Start the analysis
      ipcRenderer.invoke('analyzeText', text);
    });
  },
  onModelStatus: (callback) => {
    console.log('Setting up model status listener');
    
    // Immediately request current status
    ipcRenderer.send('getModelStatus');
    
    ipcRenderer.on('modelStatus', (_event, status) => {
        console.log('Received model status:', status);
        callback(status);
    });
    
    window.addEventListener('unload', () => {
        ipcRenderer.removeAllListeners('modelStatus');
    });
  },
  // a method to request current status
  checkModelStatus: () => {
    return new Promise((resolve) => {
      ipcRenderer.once('modelStatus', (_event, status) => {
        resolve(status);
      });
      ipcRenderer.send('getModelStatus');
    });
  }
});