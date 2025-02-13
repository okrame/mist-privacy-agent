import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import './styles.css';

const SidePanel = forwardRef(({ mainContainerRef }, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [phrases, setPhrases] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const panelRef = useRef(null);

  
  useImperativeHandle(ref, () => ({
    updateContent: (newPhrases) => {
      setPhrases(newPhrases || []);
    },
    updateSuggestions: (newSuggestions) => {
      setSuggestions(newSuggestions || {});
    },
    clear: () => {
      setPhrases([]);
      setSuggestions({});
    }
  }));

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  useEffect(() => {
    if (mainContainerRef.current) {
      mainContainerRef.current.classList.toggle('panel-expanded', isExpanded);
    }
  }, [isExpanded, mainContainerRef]);

  const togglePanel = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div
      ref={panelRef}
      className={`side-panel ${isExpanded ? 'expanded' : ''}`}
    >
      {/* Toggle button only visible when collapsed */}
      <button
        className="side-panel-toggle"
        onClick={togglePanel}
        aria-label="Open side panel"
        aria-expanded={isExpanded}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M15 18l-6-6 6-6" className="arrow-left" />
        </svg>
      </button>

      <div className="side-panel-header">
        <span>Summary</span>
        {/* Close button only visible when expanded */}
        <button 
          className="close-button"
          onClick={togglePanel}
          aria-label="Close side panel"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="side-panel-content">
        {phrases.length > 0 ? (
          phrases.map((phrase, index) => {
            // Find the attribute and suggestion for this phrase
            let suggestionText = null;
            Object.entries(suggestions).forEach(([attr, items]) => {
              const match = items.find(item => item.original === phrase);
              if (match) {
                suggestionText = match.suggestion;
              }
            });

            return (
              <div key={`${phrase}-${index}`} className="phrase-container">
                <div className="highlighted-word original">
                  {phrase}
                </div>
                {suggestionText && (
                  <div className="highlighted-word suggestion">
                    → {suggestionText}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="highlighted-word">No highlighted words found</div>
        )}
      </div>
    </div>
  );
});

export { SidePanel };