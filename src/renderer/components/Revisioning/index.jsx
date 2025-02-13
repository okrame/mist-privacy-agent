import React, { useState, useRef, useEffect } from 'react';
import './styles.css';

// Helper functions moved together
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1
                );
            }
        }
    }
    return dp[m][n];
}

function findBestMatch(phrase, text) {
    // 1. For single words, use strict word boundary matching
    if (!phrase.includes(' ')) {
        // Create regex that matches the exact word with boundaries
        // This ensures "closes" doesn't match "close"
        const wordRegex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
        const match = text.match(wordRegex);
        if (match) {
            return {
                found: true,
                text: match[0],
                startIndex: match.index,
                length: match[0].length
            };
        }
        return { found: false };
    }

    // 2. For multi-word phrases, try exact phrase matching first
    const exactRegex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
    const exactMatch = text.match(exactRegex);
    if (exactMatch) {
        return {
            found: true,
            text: exactMatch[0],
            startIndex: exactMatch.index,
            length: exactMatch[0].length
        };
    }

    // 3. For multi-word phrases, try fuzzy matching with strict controls
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    // Look for sequences that match our phrase
    for (let i = 0; i <= textWords.length - phraseWords.length; i++) {
        let allWordsMatch = true;
        let sequence = '';
        
        for (let j = 0; j < phraseWords.length; j++) {
            const textWord = textWords[i + j];
            const phraseWord = phraseWords[j];
            
            // Words must match exactly for multi-word phrases
            if (textWord !== phraseWord) {
                allWordsMatch = false;
                break;
            }
            sequence += (j === 0 ? '' : ' ') + textWord;
        }
        
        if (allWordsMatch) {
            // Find the actual position in original text
            const startIndex = text.toLowerCase().indexOf(sequence);
            if (startIndex !== -1) {
                return {
                    found: true,
                    text: text.slice(startIndex, startIndex + sequence.length),
                    startIndex: startIndex,
                    length: sequence.length
                };
            }
        }
    }

    return { found: false };
}

function findMatches(text, phrases, attributeMap) {
    // Create a map of exact phrases for validation
    const exactPhrases = new Map(phrases.map(p => [p.toLowerCase(), p]));
    
    let matches = [];
    phrases.forEach(phrase => {
        const match = findBestMatch(phrase, text);
        if (match.found && exactPhrases.has(match.text.toLowerCase())) {
            matches.push({
                start: match.startIndex,
                end: match.startIndex + match.length,
                phrase: match.text,
                attribute: attributeMap.get(phrase.toLowerCase())
            });
        }
    });

    // Sort and filter overlapping matches
    return matches
        .sort((a, b) => a.start - b.start)
        .reduce((acc, match) => {
            if (!acc.length || match.start >= acc[acc.length - 1].end) {
                acc.push(match);
            }
            return acc;
        }, []);
}

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

    // Build maps
    Object.entries(attributePhrases).forEach(([attribute, phraseList]) => {
        phraseList.forEach(phrase => {
            phraseAttributeMap.set(phrase.toLowerCase(), attribute);
        });
    });

    Object.entries(suggestions).forEach(([attribute, replacements]) => {
        replacements.forEach(({ original, suggestion }) => {
            suggestionMap[original.toLowerCase()] = {
                suggestion,
                attribute
            };
            reverseMap[suggestion.toLowerCase()] = {
                original,
                attribute
            };
            phraseAttributeMap.set(suggestion.toLowerCase(), attribute);
        });
    });

    // Maintain cursor visibility
    const maintainCursorVisibility = () => {
        if (!textareaRef.current || !contentRef.current) return;
    
        const textarea = textareaRef.current;
        const content = contentRef.current;
        
        // Force sync scroll positions first
        content.scrollTop = textarea.scrollTop;
        content.scrollLeft = textarea.scrollLeft;
    
        const cursorPosition = textarea.selectionStart;
        if (cursorPosition === undefined) return;
    
        // Create a more precise measurement div
        const temp = document.createElement('div');
        temp.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            word-wrap: break-word;
            width: ${getComputedStyle(textarea).width};
            font: ${getComputedStyle(textarea).font};
            padding: ${getComputedStyle(textarea).padding};
            letter-spacing: ${getComputedStyle(textarea).letterSpacing};
            box-sizing: border-box;
        `;
    
        // Get the text up to cursor
        const textUpToCursor = textarea.value.substring(0, cursorPosition);
        temp.textContent = textUpToCursor;
        document.body.appendChild(temp);
    
        const cursorTop = temp.offsetHeight;
        document.body.removeChild(temp);
    
        const scrollTop = textarea.scrollTop;
        const viewportHeight = textarea.offsetHeight;
    
        // Adjust scroll if cursor is out of view
        if (cursorTop < scrollTop) {
            const newScrollTop = Math.max(0, cursorTop - 20);
            textarea.scrollTop = newScrollTop;
            content.scrollTop = newScrollTop;
        } else if (cursorTop > scrollTop + viewportHeight - 20) {
            const newScrollTop = Math.max(0, cursorTop - viewportHeight + 40);
            textarea.scrollTop = newScrollTop;
            content.scrollTop = newScrollTop;
        }
    };

    

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
    

    // Improved phrase interaction handlers
    const handlePhraseClick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const phraseElement = e.target.closest('.revisioning-phrase');
        if (!phraseElement) return;

        const phrase = phraseElement.dataset.phrase;
        const isReplaced = phraseElement.dataset.isReplaced === 'true';
        const phraseLower = phrase.toLowerCase();
        const map = isReplaced ? reverseMap : suggestionMap;

        if (map[phraseLower]) {
            const replacement = isReplaced ? 
                map[phraseLower].original : 
                map[phraseLower].suggestion;

            // Improved replacement logic with case preservationv
            const newText = text.replace(
                new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'),
                (match) => match[0] === match[0].toUpperCase() ?
                    replacement.charAt(0).toUpperCase() + replacement.slice(1) :
                    replacement
            );

            onTextChange(newText);

            // Update replaced phrases set
            const newReplacedPhrases = new Set(replacedPhrases);
            if (isReplaced) {
                newReplacedPhrases.delete(phraseLower);
            } else {
                newReplacedPhrases.add(map[phraseLower].suggestion.toLowerCase());
            }
            setReplacedPhrases(newReplacedPhrases);
        }
    };

    const handlePhraseMouseEnter = (e) => {
        const phraseElement = e.target.closest('.revisioning-phrase');
        if (phraseElement) {
            setHoveredPhrase(phraseElement.dataset.phrase);
        }
    };

    const handlePhraseMouseLeave = () => {
        setHoveredPhrase(null);
    };

    // Render text with highlights
    // Render text with improved interaction handling
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
            const suggestionText = isReplaced
                ? reverseMap[phraseLower]?.original
                : suggestionMap[phraseLower]?.suggestion;
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
                //style={{ pointerEvents: 'auto' }}
                onMouseDown={(e) => {
                    // Prevent text selection when clicking phrases
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