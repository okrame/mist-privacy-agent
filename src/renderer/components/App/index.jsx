import React, { useState, useEffect, useRef } from 'react';
import { processProposal } from '../../utils/utils';
import { AnalysisTable, useAnalysisTable } from '../Table';
import { SidePanel } from '../SidePanel';
import { useSidePanel } from '../SidePanel/useSidePanel';
import './styles.css';
import ModeToggle from '../ModeToggle';
import Spinner from '../Spinner';
import PrivacyOutput from '../PrivacyOutput';
import Revisioning from '../Revisioning';



const App = () => {
  // States
  const [modelReady, setModelReady] = useState(false);
  const [inputText, setInputText] = useState('');
  const [lastAnalyzedPhrases, setLastAnalyzedPhrases] = useState([]);
  const [status, setStatus] = useState('Initializing model...');
  const [attributePhrases, setAttributePhrases] = useState({});
  const [mode, setMode] = useState('normal');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [privacyModelReady, setPrivacyModelReady] = useState(false);
  const [isPrivacyProcessing, setIsPrivacyProcessing] = useState(false);
  const [privacyOutput, setPrivacyOutput] = useState('');

  const [suggestions, setSuggestions] = useState({});


  // Refs
  const mainContainerRef = useRef(null);
  const outputRef = useRef(null);

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

  // Effect for model status
  useEffect(() => {
    const handleModelStatus = ({ ready }) => {
      console.log('Setting model status:', ready);
      setModelReady(ready);
      if (ready) {
        setStatus('Models ready');
      }
    };

    const handlePrivacyModelStatus = ({ ready }) => {
      console.log('Setting privacy model status:', ready);
      setPrivacyModelReady(ready);
    };

    window.privacyAPI.checkModelStatus().then(handleModelStatus);
    window.privacyAPI.checkPrivacyModelStatus().then(handlePrivacyModelStatus);

    window.privacyAPI.onModelStatus(handleModelStatus);
    window.privacyAPI.onPrivacyModelStatus(handlePrivacyModelStatus);
  }, []);

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

            if (mode === 'normal' && confidence < 4) {
              continue;
            }

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

        if (mode === 'normal' && parseInt(confidence) < 4) {
          continue;
        }

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

        if (mode === 'normal') {
          const attrData = updates.get(attribute);
          if (!attrData || attrData.confidence < 4) {
            continue;
          }
        }

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
    try {
      const attributes = Array.from(tableData.values())
        .map(item => item.attribute.toLowerCase());

      console.log("Processing privacy preservation for attributes:", attributes);

      setPrivacyOutput('Processing...');
      const result = await window.privacyAPI.processPrivacy(inputText, attributes);

      // Set the rewritten text directly
      setPrivacyOutput(result.response);
    } catch (error) {
      console.error('Privacy processing error:', error);
      setPrivacyOutput(`Error: ${error.message}`);
    } finally {
      setIsPrivacyProcessing(false);
    }
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

      await window.privacyAPI.analyzeText(text, (chunk) => {
        const result = processStreamingResponse(accumulatedText, chunk.text);
        accumulatedText = result.accumulated;

        if (result.attributes) {
          attributePhrases = new Map([...attributePhrases, ...result.attributes]);
        }
      });

      if (attributePhrases.size > 0) {
        const newSuggestions = processProposal(accumulatedText, Array.from(attributePhrases.values()).flat());
        setSuggestions(newSuggestions || {});
        if (newSuggestions && sidePanelRef.current) {
          sidePanelRef.current.updateSuggestions(newSuggestions);
        }
      }
    } catch (error) {
      if (outputRef.current) {
        outputRef.current.textContent = `Error: ${error.message}`;
      }
    } finally {
      setIsAnalyzing(false);
    }
  };


  return (
    <div className="app-container" ref={mainContainerRef}>
      <SidePanel ref={sidePanelRef} mainContainerRef={mainContainerRef} />
      <div className="header">
        <h1>AlterEgo</h1>
        <div className="header-controls">
          <div id="status">{status}</div>
          <ModeToggle mode={mode} onToggle={() => setMode(prev => prev === 'normal' ? 'advanced' : 'normal')} />
        </div>
      </div>

      <div className="content-wrapper">
        <div className="input-wrapper">
          <Revisioning
            text={inputText}
            onTextChange={setInputText}
            phrases={lastAnalyzedPhrases}
            suggestions={suggestions}
            attributePhrases={attributePhrases}
            disabled={!modelReady}
          />
          <div className="button-spacer">
            <button
              className="send-button"
              onClick={handleAnalyze}
              disabled={!modelReady || isAnalyzing}
              aria-label="Analyze text"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="button-container">

          <PrivacyOutput text={privacyOutput} />

          <button
            onClick={handlePrivacyProcess}
            disabled={!privacyModelReady || isPrivacyProcessing}
            className="privacy-button"
          >
            Rephrase
          </button>
          <Spinner visible={isAnalyzing || isPrivacyProcessing} />
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