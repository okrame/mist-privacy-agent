import React, { useState, useEffect } from 'react';
import './styles.css';

const Initialize = () => {
  const [modelReady, setModelReady] = useState(false);
  const [privacyModelReady, setPrivacyModelReady] = useState(false);
  const [status, setStatus] = useState('Initializing models...');
  const [shouldFadeOut, setShouldFadeOut] = useState(false);

  useEffect(() => {
    const handleModelStatus = ({ ready }) => {
      setModelReady(ready);
      updateStatus();
    };

    const handlePrivacyModelStatus = ({ ready }) => {
      setPrivacyModelReady(ready);
      updateStatus();
    };

    const updateStatus = () => {
      if (!modelReady && !privacyModelReady) {
        setStatus('Initializing models...');
      } else if (modelReady && !privacyModelReady) {
        setStatus('Agent 1 ready, Agent 2 initializing...');
      } else if (!modelReady && privacyModelReady) {
        setStatus('Agent 2 ready, Agent 1 initializing...');
      } else if (modelReady && privacyModelReady) {
        setStatus('Models ready');
        setTimeout(() => {
          setShouldFadeOut(true);
        }, 500);
      }
    };

    window.privacyAPI.checkModelStatus().then(handleModelStatus);
    window.privacyAPI.checkPrivacyModelStatus().then(handlePrivacyModelStatus);

    window.privacyAPI.onModelStatus(handleModelStatus);
    window.privacyAPI.onPrivacyModelStatus(handlePrivacyModelStatus);
  }, [modelReady, privacyModelReady]);

  return (
    <div className={`initialize-container ${shouldFadeOut ? 'fade-out' : ''}`}>
      <div className="app-preview">
        {/* Header */}
        <div className="preview-header">
          <h1>Mist</h1>
        </div>

        {/* Main content area */}
        <div className="preview-content">
          <div className="preview-input-area">
            <div className="preview-textarea"></div>
            <div className="preview-buttons">
              <div className="preview-button"></div>
              <div className="preview-button"></div>
            </div>
          </div>
          
          <div className="preview-output-area">
            <div className="preview-table-row"></div>
            <div className="preview-table-row"></div>
            <div className="preview-table-row"></div>
          </div>
        </div>

        {/* Frost overlay with status */}
        <div className="frost-overlay">
          <div className="nebula-container">
            <div className="nebula-outer"></div>
            <div className="nebula-inner"></div>
            <div className="nebula-core"></div>
          </div>
          <div className="status-text">{status}</div>
        </div>
      </div>
    </div>
  );
};

export default Initialize;