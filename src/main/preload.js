import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('privacyAPI', {
  onModelsProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('models:progress', handler);
    return () => ipcRenderer.removeListener('models:progress', handler);
  },
  onModelsStart: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('models:start', handler);
    return () => ipcRenderer.removeListener('models:start', handler);
  },

  onModelsDone: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('models:done', handler);
    return () => ipcRenderer.removeListener('models:done', handler);
  },

  onModelsError: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('models:error', handler);
    return () => ipcRenderer.removeListener('models:error', handler);
  },

  analyzeText: (text, onChunk) => {
    return new Promise((resolve, reject) => {
      const chunkHandler = (_event, chunk) => {
        onChunk(chunk);
      };

      const completionHandler = (_event, result) => {
        ipcRenderer.removeListener('analysisChunk', chunkHandler);
        resolve(result);
      };

      const errorHandler = (_event, error) => {
        ipcRenderer.removeListener('analysisChunk', chunkHandler);
        reject(error);
      };

      ipcRenderer.on('analysisChunk', chunkHandler);
      ipcRenderer.once('analysisComplete', completionHandler);
      ipcRenderer.once('analysisError', errorHandler);

      ipcRenderer.invoke('analyzeText', text);
    });
  },

  stopAnalysis: () => {
    return ipcRenderer.invoke('stopAnalysis');
  },

  onAnalysisStateChange: (callback) => {
    ipcRenderer.on('analysisStateChange', (_event, state) => {
      callback(state);
    });
  },

  onModelsForceKilled: (callback) => {
    ipcRenderer.on('modelsForceKilled', (_event, result) => {
      callback(result);
    });
  },

  onModelsReinitializing: (callback) => {
    const handler = (_event, status) => {
      if (!status.ready) {
        callback(true);
      }
    };

    ipcRenderer.on('modelStatus', handler);
    ipcRenderer.on('privacyModelStatus', handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('modelStatus', handler);
      ipcRenderer.removeListener('privacyModelStatus', handler);
    };
  },


  processPrivacy: (text, attributes, analyzedPhrases) => {
    return new Promise((resolve, reject) => {
      const completionHandler = (_event, result) => {
        resolve(result.data);
      };

      const errorHandler = (_event, error) => {
        reject(error);
      };

      ipcRenderer.once('privacyComplete', completionHandler);
      ipcRenderer.once('privacyError', errorHandler);
      ipcRenderer.invoke('processPrivacy', { text, attributes, analyzedPhrases });
    });
  },

  onPrivacyChunk: (callback) => {
    const handler = (_event, data) => {
      callback(data);
    };
    ipcRenderer.on('privacyChunk', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('privacyChunk', handler);
    };
  },

  onPrivacyModelStatus: (callback) => {
    ipcRenderer.send('getPrivacyModelStatus');
    ipcRenderer.on('privacyModelStatus', (_event, status) => {
      callback(status);
    });
  },

  checkPrivacyModelStatus: () => {
    return new Promise((resolve) => {
      ipcRenderer.once('privacyModelStatus', (_event, status) => {
        resolve(status);
      });
      ipcRenderer.send('getPrivacyModelStatus');
    });
  },
  onModelStatus: (callback) => {

    // Immediately request current status
    ipcRenderer.send('getModelStatus');

    ipcRenderer.on('modelStatus', (_event, status) => {
      callback(status);
    });

    window.addEventListener('unload', () => {
      ipcRenderer.removeAllListeners('modelStatus');
      ipcRenderer.removeAllListeners('privacyModelStatus');
      ipcRenderer.removeAllListeners('privacyComplete');
      ipcRenderer.removeAllListeners('privacyError');
      ipcRenderer.removeAllListeners('privacyChunk');
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