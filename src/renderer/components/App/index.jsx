import React, { useState, useEffect, useRef } from 'react';
import { highlightPhrases, processProposal } from '../../utils/utils';
import { AnalysisTable, useAnalysisTable } from '../Table';
import { SidePanel } from '../SidePanel';
import { useSidePanel } from '../SidePanel/useSidePanel';
import './styles.css';
import ModeToggle from './ModeToggle';
import Spinner from './Spinner';


const App = () => {
  // States
  const [modelReady, setModelReady] = useState(false);
  const [inputText, setInputText] = useState('');
  const [lastAnalyzedPhrases, setLastAnalyzedPhrases] = useState([]);
  const [status, setStatus] = useState('Initializing model...');
  const [attributePhrases, setAttributePhrases] = useState({});
  const [mode, setMode] = useState('normal');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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



  const toggleMode = () => {
    setMode(prevMode => prevMode === 'normal' ? 'advanced' : 'normal');
  };

  const processStreamingResponse = (accumulator, newChunk) => {
    const combined = accumulator + newChunk;
    let extractedPhrases = new Map(); // Using Map to store phrases per attribute

    // Extract attributes and their values along with explanations
    const attrPattern = /"([^"]+)":\s*{[^}]*?"estimate":\s*"([^"]+)",\s*"confidence":\s*(\d+)/g;
    let match;
    let updates = new Map();

    while ((match = attrPattern.exec(combined)) !== null) {
      const [_, key, estimate, confidence] = match;

      // Only process high confidence attributes in normal mode
      if (mode === 'normal' && parseInt(confidence) < 4) {
        continue;
      }

      // Extract explanation for this attribute if available
      const explanationPattern = new RegExp(`"${key}":\\s*{[^}]*"explanation":\\s*"((?:[^"\\\\]|\\\\"|\\\\)*?)"`, 'g');
      const explanationMatch = explanationPattern.exec(combined);
      let explanation = null;

      if (explanationMatch) {
        explanation = explanationMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16))
          )
          .trim();
      }

      updates.set(key, {
        estimate,
        confidence: parseInt(confidence),
        explanation // Include explanation if found
      });
    }

    // Update table with attribute values and explanations
    updates.forEach((value, key) => {
      tableUpdateData(key, value);
    });

    // Extract analysis phrases for each attribute
    const attributeAnalysisPattern = /"([^"]+)":\s*{[^}]*"analysis":\s*"((?:[^"\\]|\\"|\\)*?)"/g;
    let analysisMatch;

    while ((analysisMatch = attributeAnalysisPattern.exec(combined)) !== null) {
      const [_, attribute, analysisText] = analysisMatch;

      // Skip low confidence attributes in normal mode
      if (mode === 'normal') {
        const attrData = updates.get(attribute);
        if (!attrData || attrData.confidence < 4) {
          continue;
        }
      }

      // Clean up the analysis text by handling escaped quotes and Unicode
      const cleanAnalysisText = analysisText
        .replace(/\\"/g, '"')  // Replace \" with "
        .replace(/^"|"$/g, '') // Remove outer quotes
        .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
          String.fromCodePoint(parseInt(hex, 16))
        );

      const phrases = cleanAnalysisText
        .split(',')
        .map(phrase => phrase.trim())
        .filter(phrase => phrase && phrase.length > 0)
        // Clean up any remaining quotes or special characters
        .map(phrase => phrase.replace(/^["'\s]+|["'\s]+$/g, ''));

      if (phrases.length > 0) {
        extractedPhrases.set(attribute, phrases);

        // Get all phrases from all attributes processed so far
        const allPhrases = Array.from(extractedPhrases.values()).flat();

        // Update state with the new attribute phrases mapping
        setAttributePhrases(Object.fromEntries(extractedPhrases));

        // Update UI with accumulated phrases
        if (overlayRef.current) {
          overlayRef.current.innerHTML = highlightPhrases(
            inputText,
            allPhrases,
            Object.fromEntries(extractedPhrases)
          );
        }
        updateSidePanel(allPhrases);
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
    if (!modelReady || isAnalyzing) return;  
    const text = inputText.trim();
    if (!text) return;

    setIsAnalyzing(true);  
    try {
      let accumulatedText = '';
      let attributePhrases = new Map();
      tableClear();
      clearSidePanel();
      setLastAnalyzedPhrases([]);
      setAttributePhrases({});

      if (overlayRef.current) {
        overlayRef.current.textContent = inputText;
      }

      await window.privacyAPI.analyzeText(text, (chunk) => {
        const result = processStreamingResponse(accumulatedText, chunk.text);
        accumulatedText = result.accumulated;

        if (result.attributes) {
          attributePhrases = new Map([...attributePhrases, ...result.attributes]);
        }
      });

      if (attributePhrases.size > 0) {
        processProposal(accumulatedText, Array.from(attributePhrases.values()).flat());
      }
    } catch (error) {
      if (outputRef.current) {
        outputRef.current.textContent = `Error: ${error.message}`;
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value;
    setInputText(newText);

    if (overlayRef.current) {
      if (lastAnalyzedPhrases.length > 0) {
        overlayRef.current.innerHTML = highlightPhrases(
          newText,
          lastAnalyzedPhrases,
          attributePhrases 
        );
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
    <div className="app-container relative" ref={mainContainerRef}>
      <SidePanel ref={sidePanelRef} mainContainerRef={mainContainerRef} />
      <div className="header">
        <h1>AlterEgo</h1>
        <div className="header-controls">
          <div id="status">{status}</div>
          <ModeToggle mode={mode} onToggle={toggleMode} />
        </div>
      </div>

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
        <div className="button-container">
          <button
            onClick={handleAnalyze}
            disabled={!modelReady || isAnalyzing}
          >
            X-Ray
          </button>
          <Spinner visible={isAnalyzing} />
        </div>
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