import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('privacyAPI', {
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


  // Add these to the existing privacyAPI object
processPrivacy: (text, attributes) => {
  return new Promise((resolve, reject) => {
    const completionHandler = (_event, result) => {
      resolve(result.data);
    };

    const errorHandler = (_event, error) => {
      reject(error);
    };

    ipcRenderer.once('privacyComplete', completionHandler);
    ipcRenderer.once('privacyError', errorHandler);
    ipcRenderer.invoke('processPrivacy', { text, attributes });
  });
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
    console.log('Setting up model status listener');
    
    // Immediately request current status
    ipcRenderer.send('getModelStatus');
    
    ipcRenderer.on('modelStatus', (_event, status) => {
        console.log('Received model status:', status);
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