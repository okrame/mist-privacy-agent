// src/renderer/components/PrivacyOutput/index.jsx
import React, { useCallback, useState } from 'react';
import './styles.css';

const PrivacyOutput = ({ text, summary = '', isProcessing = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleWheel = useCallback((e) => {
    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const height = element.clientHeight;
    
    const isAtTop = scrollTop === 0;
    const isAtBottom = scrollHeight - scrollTop === height;
    
    if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
      return;
    }
    
    if (scrollHeight > height) {
      e.stopPropagation();
    }
  }, []);

  const toggleAccordion = () => {
    setIsExpanded(!isExpanded);
  };

  if (!text && !summary && !isProcessing) return null;

  return (
    <div className="privacy-output-container">
      <div>
        <div className="privacy-header" onClick={toggleAccordion}>
        <span className={isProcessing && !summary ? 'shimmer-text' : ''}>
            {isProcessing && !summary ? 'Reasoning on privacy...' : 'Reasoned'}
          </span>
          <svg 
            viewBox="0 0 24 24" 
            width="16" 
            height="16" 
            stroke="currentColor" 
            strokeWidth="2" 
            fill="none"
            className={`chevron ${isExpanded ? 'expanded' : ''}`}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
        <div className={`privacy-content ${isExpanded ? 'expanded' : ''}`}>
          <div 
            className="privacy-output-text"
            onWheel={handleWheel}
          >
            {text || (isProcessing ? "Gathering thoughts..." : "")}
          </div>
        </div>
      </div>
      {summary && (
        <div className="summary-content">
          {summary}
        </div>
      )}
    </div>
  );
};

export default PrivacyOutput;