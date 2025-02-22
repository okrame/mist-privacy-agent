import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react'
import ConfidenceScore from './confidencescore';
import './styles.css';

const getAttributeClass = (attribute) => {
  const cleanAttribute = attribute.toLowerCase().replace(/\s+/g, '_');
  return `mark-sensitive-${cleanAttribute}`;
};


const AnalysisRow = ({ rowData, rowId, onToggle, isExpanded }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    onToggle(rowId);
  };

  const handleContentWheel = (e) => {
    const contentBox = e.target;
    const atTop = contentBox.scrollTop === 0;
    const atBottom = contentBox.scrollHeight - contentBox.scrollTop === contentBox.clientHeight;
    
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      return;
    }
    
    e.stopPropagation();
    e.preventDefault();
  };

  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  const attributeClass = getAttributeClass(rowData.attribute);

  return (
    <>
      <tr className="data-row">
        <td className="personal-data-cell">
          <div className="personal-data-content">
            <span className={`attribute-name ${attributeClass}`}>{rowData.attribute}</span>
            <button 
              className="accordion-btn"
              onClick={handleClick}
              data-row-id={rowId}
            >
              {isExpanded ? 
                <ChevronDown size={20} /> : 
                <ChevronRight size={20} />
              }
            </button>
          </div>
        </td>
        <td><ConfidenceScore score={parseInt(rowData.confidence)} /></td>
      </tr>
      <tr className={`expandable-row ${isExpanded ? 'expanded' : ''}`}>
        <td colSpan="2">
          <div className="content-box-wrapper">
            <div 
              className="content-box"
              onWheel={handleContentWheel}
              onClick={handleContentClick}
            >
              {rowData.explanation || 'Could not explain that to you, sorry!'}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
};

export const AnalysisTable = ({ data, expandedRowId, onToggleRow }) => {
  const handleWheel = useCallback((e) => {
    const isContentBox = e.target.closest('.content-box');
    
    // If we're in a content box, let it handle its own scrolling
    if (isContentBox) {
      const box = isContentBox;
      const atTop = box.scrollTop === 0;
      const atBottom = box.scrollHeight - box.scrollTop === box.clientHeight;
      
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        return; // Allow parent scrolling at edges
      }
      
      e.stopPropagation();
      return;
    }
    
    // For the main table, allow natural scrolling
    // The event will propagate to the parent
  }, []);

  return (
    <div className="analysis-table-container" onWheel={handleWheel}>
      <table className="analysis-table">
        <thead>
          <tr>
            <th>Exposed Data</th>
            <th>Criticality</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(data.entries()).map(([key, rowData], index) => (
            <AnalysisRow
              key={key}
              rowData={rowData}
              rowId={index}
              isExpanded={expandedRowId === index}
              onToggle={onToggleRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};


export const useAnalysisTable = () => {
  const [data, setData] = useState(new Map());
  const [expandedRowId, setExpandedRowId] = useState(null);
  
  const updateData = useCallback((key, value, explanation = null) => {
    if (!key || !value) return;
    
    //console.log("*Debug updateData received:", { key, value, explanation });
    
    const formattedKey = key.replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    setData(prev => {
        const next = new Map(prev);
        const existing = next.get(key) || {};
        
        const newValue = {
            attribute: formattedKey,
            estimate: value.estimate || existing.estimate,
            confidence: value.confidence || existing.confidence,
            explanation: value.explanation || explanation || existing.explanation
        };
        
        //console.log("*Debug updating data for key:", key, "with:", newValue);
        next.set(key, newValue);
        return next;
    });
}, []);

  const clear = useCallback(() => {
    setData(new Map());
    setExpandedRowId(null);
  }, []);

  const toggleRow = useCallback((rowId) => {
    setExpandedRowId(current => current === rowId ? null : rowId);
  }, []);

  return {
    data,
    expandedRowId,
    updateData,
    clear,
    toggleRow
  };
};

export default AnalysisTable;