import React, { useState, useRef, useEffect, useCallback } from 'react';
import { findMatches, findBestSuggestion, findExactMatches } from '../../utils/utils';
import './styles.css';

// Debounce utility function
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
};

const Revisioning = ({
    text,
    onTextChange,
    phrases,
    suggestions,
    attributePhrases,
    disabled
}) => {
    const [hoveredPhrase, setHoveredPhrase] = useState(null);
    const [replacedPhrases, setReplacedPhrases] = useState(new Set());
    const editorRef = useRef(null);
    const textareaRef = useRef(null);
    const contentRef = useRef(null);
    const isFirstInteraction = useRef(true);
    const hoverTimeoutRef = useRef(null);
    const previousTextRef = useRef(text);

    // Reset state when text changes
    useEffect(() => {
        if (previousTextRef.current !== text) {
            setReplacedPhrases(new Set());
            isFirstInteraction.current = true;
            setHoveredPhrase(null);
            previousTextRef.current = text;
        }
    }, [text]);

    // Reset state when suggestions change
    useEffect(() => {
        if (Object.keys(suggestions).length === 0) {
            setReplacedPhrases(new Set());
            isFirstInteraction.current = true;
            setHoveredPhrase(null);
        }
    }, [suggestions]);

    // Debug log for tracking replaced phrases
    useEffect(() => {
        console.log('Hovered phrase:', hoveredPhrase);
        console.log('Replaced phrases:', Array.from(replacedPhrases));
    }, [hoveredPhrase, replacedPhrases]);

    // Memoize maps to prevent recreating on every render
    const {
        suggestionMap,
        phraseAttributeMap,
        reverseMap,
        relatedPhrasesMap
    } = React.useMemo(() => {
        const suggMap = {};
        const phraseAttrMap = new Map();
        const revMap = {};
        const relPhrMap = new Map();

        Object.entries(attributePhrases).forEach(([attribute, phraseList]) => {
            phraseList.forEach(phrase => {
                phraseAttrMap.set(phrase.toLowerCase(), attribute);
            });
        });

        Object.entries(suggestions).forEach(([attribute, replacements]) => {
            replacements.forEach(({ original, suggestion }) => {
                if (!original || !suggestion) return;
                const originalLower = original.toLowerCase();
                const suggestionLower = suggestion.toLowerCase();

                // Forward mapping
                suggMap[originalLower] = {
                    suggestion,
                    attribute,
                    originalPhrase: original
                };

                // Reverse mapping - store both ways
                revMap[suggestionLower] = {
                    original,
                    attribute
                };
                revMap[originalLower] = {
                    suggestion,
                    attribute
                };

                // Related phrases mapping
                const relatedPhrases = replacements
                    .filter(r => r.suggestion === suggestion)
                    .map(r => r.original.toLowerCase());
                relPhrMap.set(originalLower, relatedPhrases);
                relPhrMap.set(suggestionLower, relatedPhrases);
            });
        });

        return {
            suggestionMap: suggMap,
            phraseAttributeMap: phraseAttrMap,
            reverseMap: revMap,
            relatedPhrasesMap: relPhrMap
        };
    }, [attributePhrases, suggestions]);

    // Debounced hover handlers
    const debouncedSetHoveredPhrase = useCallback(
        debounce((phrase) => {
            setHoveredPhrase(phrase);
        }, 80),
        []
    );
    // Sync scrolling
    useEffect(() => {
        const textarea = textareaRef.current;
        const content = contentRef.current;
        if (!textarea || !content) return;

        let isScrolling = false;
        let resizeTimeout;

        const syncScroll = () => {
            if (!isScrolling) {
                isScrolling = true;
                requestAnimationFrame(() => {
                    content.scrollTop = textarea.scrollTop;
                    content.scrollLeft = textarea.scrollLeft;
                    isScrolling = false;
                });
            }
        };

        const handleInput = () => {
            // Reset the scroll height to properly calculate new height
            textarea.style.height = '0';
            content.style.height = '0';

            const newHeight = Math.max(
                textarea.scrollHeight,
                content.scrollHeight,
                textarea.parentElement.clientHeight
            );

            // Apply the new height
            textarea.style.height = `${newHeight}px`;
            content.style.height = `${newHeight}px`;

            // Sync scroll positions
            requestAnimationFrame(() => {
                content.scrollTop = textarea.scrollTop;
                content.scrollLeft = textarea.scrollLeft;
            });
        };

        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleInput, 100);
        };

        // Initial setup
        handleInput();

        // Event listeners
        textarea.addEventListener('scroll', syncScroll);
        textarea.addEventListener('input', handleInput);

        // Handle window resize
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(textarea.parentElement);

        return () => {
            clearTimeout(resizeTimeout);
            textarea.removeEventListener('scroll', syncScroll);
            textarea.removeEventListener('input', handleInput);
            resizeObserver.disconnect();
        };
    }, []);


    const findSuggestionForPhrase = (phrase) => {
        return findBestSuggestion(phrase, suggestionMap);
    };



    // Improved phrase interaction handlers
    // Modified handlePhraseClick to use fuzzy matching
    const handlePhraseClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
    
        if (isFirstInteraction.current) {
            isFirstInteraction.current = false;
        }
    
        const phraseElement = e.target.closest('.revisioning-phrase');
        if (!phraseElement) return;
    
        const phrase = phraseElement.dataset.phrase;
        if (!phrase) return;
        
        // Remove this line as we don't need to check if it's replaced anymore
        // const isReplaced = phraseElement.dataset.isReplaced === 'true';
        const phraseLower = phrase.toLowerCase();
    
        // Simplified matchData lookup - only look for suggestions, not originals
        const matchData = findSuggestionForPhrase(phrase);
    
        if (matchData?.suggestion) {
            const replacement = matchData.suggestion;
            const relatedPhrases = relatedPhrasesMap.get(phraseLower) || [phraseLower];
    
            let newText = text;
            
            // Handle replacement with fuzzy matching
            const positions = relatedPhrases.map(phrase => {
                const match = findMatches(newText, [phrase], phraseAttributeMap)[0];
                return match ? {
                    phrase,
                    index: match.start,
                    length: match.end - match.start
                } : null;
            }).filter(Boolean).sort((a, b) => a.index - b.index);
    
            if (positions.length >= 2) {
                // Replace sequence including intermediary text
                const start = positions[0].index;
                const end = positions[positions.length - 1].index + positions[positions.length - 1].length;
                newText = newText.substring(0, start) + replacement + newText.substring(end);
            } else {
                // Single phrase replacement with fuzzy matching
                const match = findMatches(newText, [phrase], phraseAttributeMap)[0];
                if (match) {
                    newText = newText.substring(0, match.start) +
                        replacement +
                        newText.substring(match.end);
                }
            }
    
            onTextChange(newText);
    
            // Update replaced phrases set - only add, never remove
            setReplacedPhrases(prev => {
                const updatedSet = new Set(prev);
                updatedSet.add(replacement.toLowerCase());
                return updatedSet;
            });
        }
    };

    const handlePhraseMouseEnter = useCallback((e) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        const phraseElement = e.target.closest('.revisioning-phrase');
        if (phraseElement) {
            const phrase = phraseElement.dataset.phrase;
            debouncedSetHoveredPhrase(phrase);
        }
    }, [debouncedSetHoveredPhrase]);

    const handlePhraseMouseLeave = useCallback((e) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        hoverTimeoutRef.current = setTimeout(() => {
            debouncedSetHoveredPhrase(null);
        }, 50);
    }, [debouncedSetHoveredPhrase]);

    // Clean up timeouts on unmount
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    // Modified renderText to use fuzzy matching for suggestions
    const renderText = () => {
        if (!text || phrases.length === 0) {
            return <div className="revisioning-text">{text}</div>;
        }

        const matches = isFirstInteraction.current
            ? findMatches(text, phrases, phraseAttributeMap)
            : findExactMatches(text, phrases, phraseAttributeMap);

        const segments = [];
        let lastIndex = 0;

        matches.forEach((match, index) => {
            if (match.start > lastIndex) {
                segments.push(
                    <span key={`text-${index}`} className="revisioning-text">
                        {text.slice(lastIndex, match.start)}
                    </span>
                );
            }

            // Safely get the phrase in lowercase
            const phraseLower = match.phrase.toLowerCase().trim();

            if (!phraseLower) return; // Skip if no valid phrase
            // Check if the phrase or its replacement is in the replaced set
            const isReplaced = replacedPhrases.has(phraseLower);
            //console.log("Debug * Checking phrase in replacedPhrases:", phraseLower, replacedPhrases.has(phraseLower));

            // Safely get match data
            const matchData = isReplaced
                ? reverseMap[phraseLower] || null
                : findSuggestionForPhrase(match.phrase);
            const suggestionText = matchData
                ? (isReplaced
                    ? (matchData.original || match.phrase)
                    : (matchData.suggestion || ''))
                : null;
            const isHovered = match.phrase === hoveredPhrase;
            const attributeClass = match.attribute ? `mark-sensitive-${match.attribute}` : '';

            segments.push(
                <span key={`phrase-${index}`} className="phrase-container">
                    <span
                        //className={`revisioning-phrase ${attributeClass} ${isReplaced ? 'replaced' : ''} ${isHovered ? 'hovered' : ''}`}
                        className={`revisioning-phrase ${attributeClass} ${isReplaced ? 'replaced' : ''} ${isHovered ? 'hovered' : ''} ${suggestionText ? 'has-suggestion' : ''}`}
                        data-phrase={match.phrase}
                        data-testid="phrase"
                        onClick={handlePhraseClick}
                        onMouseEnter={handlePhraseMouseEnter}
                        onMouseLeave={handlePhraseMouseLeave}
                    >
                        {match.phrase}
                    </span>
                    {isHovered && suggestionText && (
                        <span className="inline-suggestion">
                            <span className="suggestion-separator">~</span>
                            <span
                                className="suggestion-text private"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePhraseClick(e);
                                }}
                            >
                                {suggestionText}
                            </span>
                        </span>
                    )}
                </span>
            );

            lastIndex = match.end;
        });

        if (lastIndex < text.length) {
            segments.push(
                <span key="text-final" className="revisioning-text">
                    {text.slice(lastIndex)}
                </span>
            );
        }

        return segments;
    };

    return (
        <div className="revisioning-editor" ref={editorRef}>
            <div
                ref={contentRef}
                className="revisioning-content"
                onMouseDown={(e) => {
                    const phraseElement = e.target.closest('.revisioning-phrase');
                    if (phraseElement) {
                        e.preventDefault();
                    }
                }}
            >
                {renderText()}
            </div>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                disabled={disabled}
                placeholder="Enter your text here..."
                spellCheck={false}
                className="revisioning-textarea"
            />
        </div>
    );
};

export default React.memo(Revisioning);