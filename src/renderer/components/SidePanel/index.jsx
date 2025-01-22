import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import './styles.css';

const SidePanel = forwardRef(({ mainContainerRef }, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [phrases, setPhrases] = useState([]);
  
  // Refs per accedere agli elementi DOM
  const panelRef = useRef(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    updateContent: (newPhrases) => {
      setPhrases(newPhrases || []);
    },
    clear: () => {
      setPhrases([]);
    }
  }));

  // Gestione tasto ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  // Aggiorna le classi del container principale quando cambia isExpanded
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
      <button
        className="side-panel-toggle"
        onClick={togglePanel}
        aria-label="Toggle side panel"
        aria-expanded={isExpanded}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M15 18l-6-6 6-6" className="arrow-left" />
          <path d="M9 18l6-6-6-6" className="arrow-right" />
        </svg>
      </button>

      <div className="side-panel-header">
        <span>Highlighted Words</span>
      </div>

      <div className="side-panel-content">
        {phrases.length > 0 ? (
          phrases.map((phrase, index) => (
            <div key={`${phrase}-${index}`} className="highlighted-word">
              {phrase}
            </div>
          ))
        ) : (
          <div className="highlighted-word">No highlighted words found</div>
        )}
      </div>
    </div>
  );
});

export { SidePanel };