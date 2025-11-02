import React, { useState, useEffect, useRef } from 'react';
import { processProposal } from '../../utils/utils';
import { AnalysisTable, useAnalysisTable } from '../Table';
import { SidePanel } from '../SidePanel';
import { useSidePanel } from '../SidePanel/useSidePanel';
import './styles.css';
//import ModeToggle from '../ModeToggle';
import Spinner from '../Spinner';
import PrivacyOutput from '../PrivacyOutput';
import Revisioning from '../Revisioning';
import Initialize from '../Initialize';




const App = () => {
  // States
  const [modelReady, setModelReady] = useState(false);
  const [inputText, setInputText] = useState('');
  const [lastAnalyzedPhrases, setLastAnalyzedPhrases] = useState([]);
  const [status, setStatus] = useState('Initializing model...');
  const [attributePhrases, setAttributePhrases] = useState({});
  //const [mode, setMode] = useState('normal');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [privacyModelReady, setPrivacyModelReady] = useState(false);
  const [isPrivacyProcessing, setIsPrivacyProcessing] = useState(false);
  const [privacyOutput, setPrivacyOutput] = useState('');
  const [isPostStop, setIsPostStop] = useState(false);
  const [suggestions, setSuggestions] = useState({});

  const [privacySummary, setPrivacySummary] = useState('');


  // Refs
  const mainContainerRef = useRef(null);
  const outputRef = useRef(null);
  const removeChunkListener = useRef(null);

  // Hooks
  const {
    data: tableData,
    expandedRowId,
    updateData: tableUpdateData,
    clear: tableClear,
    toggleRow: tableToggleRow
  } = useAnalysisTable();

  const {
    ref: sidePanelRef,
    updateContent: updateSidePanel,
    clear: clearSidePanel
  } = useSidePanel();




  // effect for privacy chunks
  useEffect(() => {
    const handlePrivacyChunk = (data) => {
      //console.log('Received privacy chunk:', data);
      if (data.error) {
        setPrivacyOutput(`Error: ${data.text}`);
        setPrivacySummary('');
        return;
      }
      // Update the output with each chunk
      setPrivacyOutput(data.text);
      // Update the summary if available
      if ('summary' in data) {
        setPrivacySummary(data.summary);
      }
    };

    // Setup the privacy chunk listener
    const removeListener = window.privacyAPI.onPrivacyChunk(handlePrivacyChunk);
    removeChunkListener.current = removeListener;

    return () => {
      if (removeChunkListener.current) {
        removeChunkListener.current();
      }
    };
  }, []);



  useEffect(() => {
    const handleAnalysisStateChange = (state) => {
      console.log("Analysis state changed:", state);

      if ('isAnalyzing' in state) {
        setIsAnalyzing(state.isAnalyzing);
      }
      if ('isPostStop' in state) {
        console.log("Setting isPostStop:", state.isPostStop);
        setIsPostStop(state.isPostStop);
      }

      // Explicit reset when stopping is fully complete
      if (!state.isAnalyzing && state.isPostStop === false) {
        console.log("Final reset of isPostStop.");
        setIsPostStop(false);
      }
    };

    window.privacyAPI?.onAnalysisStateChange?.(handleAnalysisStateChange);
    return () => {
      window.privacyAPI.onAnalysisStateChange(() => { });
    };
  }, []);

  // Effect for model status
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
      }
    };

    window.privacyAPI.checkModelStatus().then(handleModelStatus);
    window.privacyAPI.checkPrivacyModelStatus().then(handlePrivacyModelStatus);

    window.privacyAPI.onModelStatus(handleModelStatus);
    window.privacyAPI.onPrivacyModelStatus(handlePrivacyModelStatus);
  }, [modelReady, privacyModelReady]);

  // Effect for textarea resize
  // useEffect(() => {
  //   const resizeObserver = new ResizeObserver(entries => {
  //     for (const entry of entries) {
  //       const { height } = entry.contentRect;
  //       if (overlayRef.current) {
  //         overlayRef.current.style.height = `${height}px`;
  //       }
  //     }
  //   });

  //   if (inputTextRef.current) {
  //     resizeObserver.observe(inputTextRef.current);
  //   }

  //   return () => resizeObserver.disconnect();
  // }, []);

  const processStreamingResponse = (accumulator, newChunk) => {
    const combined = accumulator + newChunk;
    let extractedPhrases = new Map();
    let updates = new Map();

    // Check if we have the new format with "inferable" key
    const hasInferable = combined.includes('"inferable"');

    if (hasInferable) {
      // NEW FORMAT HANDLING
      const inferableMatch = combined.match(/"inferable":\s*({[\s\S]*?})(,\s*"non_inferable"|$)/);

      if (inferableMatch) {
        const inferableContent = inferableMatch[1];
        const attributePattern = /"([^"]+)":\s*({[^}]+?"estimate":[^}]+?"confidence":[^}]+?"analysis":[^}]+?"explanation":[^}]+?})/g;
        let match;

        while ((match = attributePattern.exec(inferableContent)) !== null) {
          const [_, key, attributeObject] = match;

          // Extract estimate
          const estimateMatch = /"estimate"\s*:\s*"([^"]+)"/.exec(attributeObject);
          // Extract confidence
          const confidenceMatch = /"confidence"\s*:\s*(\d+)/.exec(attributeObject);

          if (estimateMatch && confidenceMatch) {
            const estimate = estimateMatch[1];
            const confidence = parseInt(confidenceMatch[1]);

            // if (mode === 'normal' && confidence < 4) {
            //   continue;
            // }

            // Extract explanation
            const explanationMatch = /"explanation"\s*:\s*"((?:[^"\\]|\\"|\\)*?)"/.exec(attributeObject);
            const explanation = explanationMatch ?
              explanationMatch[1]
                .replace(/\\"/g, '"')
                .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
                  String.fromCodePoint(parseInt(hex, 16))
                )
                .trim()
              : null;

            updates.set(key, {
              estimate,
              confidence,
              explanation
            });

            // Extract and process analysis phrases
            const analysisMatch = /"analysis"\s*:\s*"((?:[^"\\]|\\"|\\)*?)"/.exec(attributeObject);
            if (analysisMatch) {
              const analysisText = analysisMatch[1]
                .replace(/\\"/g, '"')
                .replace(/^"|"$/g, '')
                .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
                  String.fromCodePoint(parseInt(hex, 16))
                );

              const phrases = analysisText
                .split(',')
                .map(phrase => phrase.trim())
                .filter(phrase => phrase && phrase.length > 0)
                .map(phrase => phrase.replace(/^["'\s]+|["'\s]+$/g, ''));

              if (phrases.length > 0) {
                extractedPhrases.set(key, phrases);
              }
            }
          }
        }

      }
    } else {
      // OLD FORMAT HANDLING
      const attrPattern = /"([^"]+)":\s*{[^}]*?"estimate":\s*"([^"]+)",\s*"confidence":\s*(\d+)/g;
      let match;

      while ((match = attrPattern.exec(combined)) !== null) {
        const [_, key, estimate, confidence] = match;

        // if (mode === 'normal' && parseInt(confidence) < 4) {
        //   continue;
        // }

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
          explanation
        });
      }

      const attributeAnalysisPattern = /"([^"]+)":\s*{[^}]*"analysis":\s*"((?:[^"\\]|\\"|\\)*?)"/g;
      let analysisMatch;

      while ((analysisMatch = attributeAnalysisPattern.exec(combined)) !== null) {
        const [_, attribute, analysisText] = analysisMatch;

        // if (mode === 'normal') {
        //   const attrData = updates.get(attribute);
        //   if (!attrData || attrData.confidence < 4) {
        //     continue;
        //   }
        // }

        const cleanAnalysisText = analysisText
          .replace(/\\"/g, '"')
          .replace(/^"|"$/g, '')
          .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16))
          );

        const phrases = cleanAnalysisText
          .split(',')
          .map(phrase => phrase.trim())
          .filter(phrase => phrase && phrase.length > 0)
          .map(phrase => phrase.replace(/^["'\s]+|["'\s]+$/g, ''));

        if (phrases.length > 0) {
          extractedPhrases.set(attribute, phrases);
        }
      }
    }

    // Common updates for both formats
    updates.forEach((value, key) => {
      tableUpdateData(key, value);
    });

    if (extractedPhrases.size > 0) {
      const allPhrases = Array.from(extractedPhrases.values()).flat();
      setAttributePhrases(Object.fromEntries(extractedPhrases));

      // if (overlayRef.current) {
      //   overlayRef.current.innerHTML = highlightPhrases(
      //     inputText,
      //     allPhrases,
      //     Object.fromEntries(extractedPhrases)
      //   );
      // }
      updateSidePanel(allPhrases);
      setLastAnalyzedPhrases(allPhrases);
    }

    return {
      accumulated: combined,
      analysedWords: Array.from(extractedPhrases.values()).flat(),
      attributes: extractedPhrases
    };
  };


  const handlePrivacyProcess = async () => {
    if (!privacyModelReady || isPrivacyProcessing) return;

    setIsPrivacyProcessing(true);
    setPrivacyOutput('Gathering thoughts on privacy...'); // Initial state
    setPrivacySummary(''); // Clear summary

    try {
      const attributes = Array.from(tableData.values())
        .map(item => item.attribute.toLowerCase());

      console.log("Rephrasing for Attributes:", attributes);
      console.log("Rephrasing for Phrases:", lastAnalyzedPhrases);

      await window.privacyAPI.processPrivacy(inputText, attributes, lastAnalyzedPhrases);

    } catch (error) {
      console.error('Privacy processing error:', error);
      setPrivacyOutput(`Error: ${error.message}`);
      setPrivacySummary('');
    } finally {
      setIsPrivacyProcessing(false);
    }
  };

  // Update the handleAnalyze function in App.jsx
  const handleAnalyze = async () => {
    if (!modelReady) return;

    // Handle stop case
    if (isAnalyzing) {
      try {
        setIsAnalyzing(false);
        setIsPostStop(true); // Indicate stopping in progress
        await window.privacyAPI.stopAnalysis();
        return;
      } catch (error) {
        console.error('Error stopping analysis:', error);
        setIsAnalyzing(false);
        setIsPostStop(false);  // Reset on error
        return;
      }
    }

    // Clear privacy output when starting new analysis
    //setPrivacyOutput('');
    //setPrivacySummary('');

    const text = inputText.trim();
    if (!text) return;

    setIsAnalyzing(true);
    setIsPostStop(false); // Ensure we are in a valid state to start

    try {
      let accumulatedText = '';
      let attributePhrases = new Map();
      tableClear();
      clearSidePanel();
      setLastAnalyzedPhrases([]);
      setAttributePhrases({});
      setSuggestions({});

      await window.privacyAPI.analyzeText(text, (chunk) => {
        // Process each chunk
        const result = processStreamingResponse(accumulatedText, chunk.text);
        accumulatedText = result.accumulated;

        if (result.attributes) {
          attributePhrases = new Map([...attributePhrases, ...result.attributes]);
        }
      });

      // Process final suggestions only after all chunks are processed
      if (attributePhrases.size > 0) {
        const allPhrases = Array.from(attributePhrases.values()).flat();
        const newSuggestions = processProposal(accumulatedText, allPhrases);
        setSuggestions(newSuggestions || {});
        if (newSuggestions && sidePanelRef.current) {
          sidePanelRef.current.updateSuggestions(newSuggestions);
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
      if (outputRef.current) {
        outputRef.current.textContent = `Error: ${error.message || 'An unknown error occurred during analysis'}`;
      }
    } finally {
      setIsAnalyzing(false);
      setIsPostStop(false); // Ensure reset after completion
    }
  };

  const allModelsReady = modelReady && privacyModelReady;

  return (
    <>
      {!allModelsReady ? (
        <Initialize />
      ) : (
        <div className="app-container" ref={mainContainerRef}>
          <SidePanel ref={sidePanelRef} mainContainerRef={mainContainerRef} />
          <div className="header">
            <h1>Mist</h1>
            <div className="header-controls">
              <div id="status">{status}</div>
            </div>
          </div>

          <PrivacyOutput
            text={privacyOutput}
            summary={privacySummary}
            isProcessing={isPrivacyProcessing}
          />

          <div className="content-wrapper">
            <div className="input-wrapper">
              <Revisioning
                text={inputText}
                onTextChange={setInputText}
                phrases={lastAnalyzedPhrases}
                suggestions={suggestions}
                attributePhrases={attributePhrases}
                disabled={!modelReady || isPostStop}
              />
              <div className="button-spacer">
                <Spinner visible={isAnalyzing || isPrivacyProcessing} />
                <button
                  onClick={handlePrivacyProcess}
                  disabled={!privacyModelReady || isPrivacyProcessing || isAnalyzing}
                  className="anon-button"
                  title="Rephrase text"
                >
                  Mist
                </button>
                <button
                  className={`send-button ${isPostStop ? 'post-stop' : ''}`}
                  onClick={handleAnalyze}
                  disabled={!modelReady || isPostStop}
                  aria-label={isAnalyzing ? "Stop analysis" : "Analyze text"}
                >
                  {isAnalyzing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="4" y="4" width="6" height="6" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 488.85 488.85" fill="currentColor">
                      <path d="M244.425,98.725c-93.4,0-178.1,51.1-240.6,134.1c-5.1,6.8-5.1,16.3,0,23.1c62.5,83.1,147.2,134.2,240.6,134.2
s178.1-51.1,240.6-134.1c5.1-6.8,5.1-16.3,0-23.1C422.525,149.825,337.825,98.725,244.425,98.725z M251.125,347.025
c-62,3.9-113.2-47.2-109.3-109.3c3.2-51.2,44.7-92.7,95.9-95.9c62-3.9,113.2,47.2,109.3,109.3
C343.725,302.225,302.225,343.725,251.125,347.025z M248.025,299.625c-33.4,2.1-61-25.4-58.8-58.8c1.7-27.6,24.1-49.9,51.7-51.7
c33.4-2.1,61,25.4,58.8,58.8C297.925,275.625,275.525,297.925,248.025,299.625z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {(isAnalyzing || tableData.size > 0) && (
              <div ref={outputRef} id="output">
                <AnalysisTable
                  data={tableData}
                  expandedRowId={expandedRowId}
                  onToggleRow={tableToggleRow}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default App;