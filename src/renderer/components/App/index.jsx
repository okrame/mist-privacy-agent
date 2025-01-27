import React, { useState, useEffect, useRef } from 'react';
import { highlightPhrases, processProposal, extractExplanation } from '../../utils/utils';
import { AnalysisTable, useAnalysisTable } from '../Table';
import { SidePanel } from '../SidePanel';
import { useSidePanel } from '../SidePanel/useSidePanel';
import './styles.css';

const App = () => {
  // States
  const [modelReady, setModelReady] = useState(false);
  const [inputText, setInputText] = useState('');
  const [analysisProcessed, setAnalysisProcessed] = useState(false);
  const [lastAnalyzedPhrases, setLastAnalyzedPhrases] = useState([]);
  const [status, setStatus] = useState('Initializing model...');

  // Refs
  const mainContainerRef = useRef(null);
  const overlayRef = useRef(null);
  const inputTextRef = useRef(null);
  const outputRef = useRef(null);

  // Hooks
  const {
    data: tableData,
    expandedRowId,
    updateData: tableUpdateData,
    clear: tableClear,
    toggleRow: tableToggleRow
  } = useAnalysisTable();

  const { ref: sidePanelRef, updateContent: updateSidePanel, clear: clearSidePanel } = useSidePanel();


  // Model status listener
  useEffect(() => {
    const handleModelStatus = ({ ready }) => {
      console.log('Setting model statuss:', ready);
      setModelReady(ready);
      if (ready) {
          setStatus('Model ready');
      }
  };

    // Check initial status
    window.privacyAPI.checkModelStatus().then(handleModelStatus);
    
    // Listen for future updates
    window.privacyAPI.onModelStatus(handleModelStatus);
}, []);

  // Gestione resize textarea
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { height } = entry.contentRect;
        if (overlayRef.current) {
          overlayRef.current.style.height = `${height}px`;
        }
      }
    });

    if (inputTextRef.current) {
      resizeObserver.observe(inputTextRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // const processStreamingResponse = (accumulator, newChunk) => {
  //   const combined = accumulator + newChunk;
  //   let extractedPhrases = null;

  //   if (!analysisProcessed && !combined.includes('"explanation"')) {
  //     const attrPattern = /"([^"]+)":\s*{\s*"estimate":\s*"([^"]+)",\s*"confidence":\s*(\d+)/g;
  //     let match;
  //     let updates = new Map();

  //     while ((match = attrPattern.exec(combined)) !== null) {
  //       const [_, key, estimate, confidence] = match;
  //       updates.set(key, {
  //         estimate,
  //         confidence: parseInt(confidence)
  //       });
  //     }

  //     updates.forEach((value, key) => {
  //       tableUpdateData(key, value);
  //     });

  //     const patterns = [
  //       /"analysis"\s*:\s*"([^"]+)"/,
  //       /"analysis"\s*:\s*"\\"([^"]+)\\""/,
  //       /"analysis"\s*:\s*'([^']+)'/
  //     ];

  //     for (const pattern of patterns) {
  //       const analysisMatch = combined.match(pattern);
  //       if (analysisMatch) {
  //         const phrases = analysisMatch[1]
  //           .split(',')
  //           .map(phrase =>
  //             phrase
  //               .trim()
  //               .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
  //                 String.fromCodePoint(parseInt(hex, 16))
  //               )
  //           )
  //           .filter(phrase => phrase && phrase !== '\\' && phrase !== '"');

  //         if (phrases.length > 0) {
  //           setLastAnalyzedPhrases(phrases);
  //           if (overlayRef.current) {
  //             overlayRef.current.innerHTML = highlightPhrases(inputText, phrases);
  //           }
  //           updateSidePanel(phrases);
  //           setAnalysisProcessed(true);
  //           extractedPhrases = phrases;
  //           break;
  //         }
  //       }
  //     }
  //   }

  //   return {
  //     accumulated: combined,
  //     analysedWords: extractedPhrases
  //   };
  // };

  const processStreamingResponse = (accumulator, newChunk) => {
    const combined = accumulator + newChunk;
    let extractedPhrases = new Map(); // Using Map to store phrases per attribute
  
    // Extract attributes and their values
    const attrPattern = /"([^"]+)":\s*{\s*"estimate":\s*"([^"]+)",\s*"confidence":\s*(\d+)/g;
    let match;
    let updates = new Map();
  
    while ((match = attrPattern.exec(combined)) !== null) {
      const [_, key, estimate, confidence] = match;
      updates.set(key, {
        estimate,
        confidence: parseInt(confidence)
      });
    }
  
    // Update table with attribute values
    updates.forEach((value, key) => {
      tableUpdateData(key, value);
    });
  
    // Extract analysis phrases for each attribute
    const attributeAnalysisPattern = /"([^"]+)":\s*{[^}]*"analysis":\s*"([^"]+)"/g;
    let analysisMatch;
  
    while ((analysisMatch = attributeAnalysisPattern.exec(combined)) !== null) {
      const [_, attribute, analysisText] = analysisMatch;
      
      // Process the analysis text to extract phrases
      const phrases = analysisText
        .split(',')
        .map(phrase => 
          phrase
            .trim()
            .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
              String.fromCodePoint(parseInt(hex, 16))
            )
        )
        .filter(phrase => phrase && phrase !== '\\' && phrase !== '"');
  
      if (phrases.length > 0) {
        extractedPhrases.set(attribute, phrases);
        
        // Update UI for this attribute's phrases
        if (overlayRef.current) {
          // Combine all phrases found so far
          const allPhrases = Array.from(extractedPhrases.values()).flat();
          overlayRef.current.innerHTML = highlightPhrases(inputText, allPhrases);
        }
        
        // Update side panel with all phrases found so far
        const allPhrases = Array.from(extractedPhrases.values()).flat();
        updateSidePanel(allPhrases);
        
        // Update last analyzed phrases state
        setLastAnalyzedPhrases(allPhrases);
      }
    }
  
    return {
      accumulated: combined,
      analysedWords: Array.from(extractedPhrases.values()).flat(),
      attributes: extractedPhrases
    };
  };


  const handleAnalyze = async () => {
    if (!modelReady) return;
    const text = inputText.trim();
    if (!text) return;
  
    try {
      let accumulatedText = '';
      let attributePhrases = new Map();
      tableClear();
      clearSidePanel();
      setLastAnalyzedPhrases([]);
  
      await window.privacyAPI.analyzeText(text, (chunk) => {
        const result = processStreamingResponse(accumulatedText, chunk.text);
        accumulatedText = result.accumulated;
  
        // Update attribute phrases map
        if (result.attributes) {
          attributePhrases = new Map([...attributePhrases, ...result.attributes]);
        }
      });
  
      // Process explanations after all chunks are processed
      if (attributePhrases.size > 0) {
        const explanations = extractExplanation(accumulatedText);
        
        for (const [key, explanation] of explanations) {
          tableUpdateData(key, {
            estimate: tableData.get(key)?.estimate || '',
            confidence: tableData.get(key)?.confidence || 0,
            explanation: explanation
          });
        }
        
        processProposal(accumulatedText, Array.from(attributePhrases.values()).flat());
      }
    } catch (error) {
      if (outputRef.current) {
        outputRef.current.textContent = `Error: ${error.message}`;
      }
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value;
    setInputText(newText);

    if (overlayRef.current) {
      if (lastAnalyzedPhrases.length > 0) {
        overlayRef.current.innerHTML = highlightPhrases(newText, lastAnalyzedPhrases);
      } else {
        overlayRef.current.textContent = newText;
      }
      overlayRef.current.style.height = `${e.target.offsetHeight}px`;
    }
  };

  const handleScroll = (e) => {
    if (overlayRef.current) {
      requestAnimationFrame(() => {
        overlayRef.current.scrollTop = e.target.scrollTop;
        overlayRef.current.scrollLeft = e.target.scrollLeft;
      });
    }
  };

  return (
    <div className="app-container" ref={mainContainerRef}>
      <SidePanel ref={sidePanelRef} mainContainerRef={mainContainerRef} />
      <h1>AlterEgo</h1>
      <div id="status">{status}</div>
      <div className="content-wrapper">
        <div className="input-wrapper">
          <div ref={overlayRef} className="overlay" />
          <textarea
            ref={inputTextRef}
            value={inputText}
            onChange={handleInputChange}
            onScroll={handleScroll}
            placeholder="Enter your text here..."
            disabled={!modelReady}
          />
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!modelReady}
        >
          Analyzee!!
        </button>
        <div ref={outputRef} id="output">
          <AnalysisTable
            data={tableData}
            expandedRowId={expandedRowId}
            onToggleRow={tableToggleRow}
          />
        </div>
      </div>
    </div>
  );
};

export default App;