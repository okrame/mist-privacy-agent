import React, { useState, useRef, useEffect } from 'react';
import { escapeRegExp, findMatches, findBestSuggestion } from '../../utils/utils';
import './styles.css';


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

    // Create suggestion and attribute maps
    const suggestionMap = {};
    const phraseAttributeMap = new Map();
    const reverseMap = {};
    const relatedPhrasesMap = new Map();

    // Build maps
    Object.entries(attributePhrases).forEach(([attribute, phraseList]) => {
        phraseList.forEach(phrase => {
            phraseAttributeMap.set(phrase.toLowerCase(), attribute);
        });
    });

    // Modified suggestion mapping to include fuzzy matching
    Object.entries(suggestions).forEach(([attribute, replacements]) => {
        replacements.forEach(({ original, suggestion }) => {
            // Store the original phrase for fuzzy matching
            const originalLower = original.toLowerCase();
            suggestionMap[originalLower] = {
                suggestion,
                attribute,
                originalPhrase: original // Keep the original case
            };

            // Add reverse mapping
            reverseMap[suggestion.toLowerCase()] = {
                original,
                attribute
            };

            // Create related phrases mapping
            const relatedPhrases = replacements
                .filter(r => r.suggestion === suggestion)
                .map(r => r.original.toLowerCase());
            relatedPhrasesMap.set(originalLower, relatedPhrases);
        });
    });


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

    const phraseElement = e.target.closest('.revisioning-phrase');
    if (!phraseElement) return;

    const phrase = phraseElement.dataset.phrase;
    const isReplaced = phraseElement.dataset.isReplaced === 'true';
    const phraseLower = phrase.toLowerCase();

    let matchData;
    if (isReplaced) {
        matchData = reverseMap[phraseLower];
    } else {
        matchData = findSuggestionForPhrase(phrase);
    }

    if (matchData) {
        const replacement = isReplaced ? 
            matchData.original : 
            matchData.suggestion;

        // Get related phrases that should be replaced together
        const relatedPhrases = relatedPhrasesMap.get(phraseLower) || [phraseLower];
        
        let newText = text;
        if (isReplaced) {
            // Restore all related phrases to their originals
            relatedPhrases.forEach(relatedPhrase => {
                const originalPhrase = reverseMap[relatedPhrase]?.original || relatedPhrase;
                newText = newText.replace(
                    new RegExp(`\\b${escapeRegExp(relatedPhrase)}\\b`, 'gi'),
                    originalPhrase
                );
            });
        } else {
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
        }

        onTextChange(newText);

        // Update replaced phrases set
        const newReplacedPhrases = new Set(replacedPhrases);
        if (isReplaced) {
            relatedPhrases.forEach(p => newReplacedPhrases.delete(p));
        } else {
            relatedPhrases.forEach(p => newReplacedPhrases.add(p));
        }
        setReplacedPhrases(newReplacedPhrases);
    }
};


    // Update hover handlers to use fuzzy matching
    const handlePhraseMouseEnter = (e) => {
        const phraseElement = e.target.closest('.revisioning-phrase');
        if (phraseElement) {
            setHoveredPhrase(phraseElement.dataset.phrase);
        }
    };

    const handlePhraseMouseLeave = () => {
        setHoveredPhrase(null);
    };

    // Modified renderText to use fuzzy matching for suggestions
    const renderText = () => {
        if (!text || phrases.length === 0) {
            return <div className="revisioning-text">{text}</div>;
        }

        const matches = findMatches(text, phrases, phraseAttributeMap);
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

            const phraseLower = match.phrase.toLowerCase();
            const isReplaced = replacedPhrases.has(phraseLower);
            const matchData = isReplaced
                ? reverseMap[phraseLower]
                : findSuggestionForPhrase(match.phrase);
            const suggestionText = matchData
                ? (isReplaced ? matchData.original : matchData.suggestion)
                : null;
            const isHovered = match.phrase === hoveredPhrase;
            const attributeClass = match.attribute ? `mark-sensitive-${match.attribute}` : '';

            segments.push(
                <span
                    key={`phrase-${index}`}
                    className={`revisioning-phrase ${attributeClass} ${isReplaced ? 'replaced' : ''} ${isHovered ? 'hovered' : ''} group`}
                    data-phrase={match.phrase}
                    data-is-replaced={isReplaced}
                    onClick={handlePhraseClick}
                    onMouseEnter={handlePhraseMouseEnter}
                    onMouseLeave={handlePhraseMouseLeave}
                >
                    {match.phrase}
                    {isHovered && suggestionText && (
                        <span className="revisioning-suggestion group-hover:opacity-100">
                            <span className={`suggestion-text ${isReplaced ? 'original' : 'private'}`}>
                                {suggestionText}
                                {isReplaced && (
                                    <span className="revert-icon">
                                        <svg viewBox="0 0 24 24" width="12" height="12">
                                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2.66 15.57a10 10 0 0 1 18.5-7.99M2.84 8.42a10 10 0 0 0 18.5 7.99"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                )}
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

export default Revisioning;