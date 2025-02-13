// src/renderer/components/PrivacyOutput/index.jsx
import React from 'react';
import './styles.css';

const PrivacyOutput = ({ text }) => {
  if (!text) return null;

  return (
    <div className="privacy-output-container">
      <div className="privacy-output-text">{text}</div>
    </div>
  );
};

export default PrivacyOutput;