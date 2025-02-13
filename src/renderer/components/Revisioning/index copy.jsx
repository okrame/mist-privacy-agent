import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import './styles.css';

// Import findBestMatch from utils
const findBestMatch = (phrase, text) => {
    // Special case for single words
    if (!phrase.includes(' ')) {
        const phraseRegex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
        const match = text.match(phraseRegex);
        if (match) {
            return {
                found: true,
                text: match[0],
                startIndex: match.index,
                length: match[0].length
            };
        }
    }

    const phraseWords = phrase.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    const MIN_MATCH_WORDS = phraseWords.length === 1 ? 1 : Math.ceil(phraseWords.length * 0.7);
    const MAX_MATCH_DISTANCE = phraseWords.length === 1 ? 0 : 1;

    let maxMatchLength = 0;
    let bestMatchStart = -1;
    let bestMatchEnd = -1;

    for (let i = 0; i < textWords.length; i++) {
        let matchCount = 0;
        let lastMatchIndex = -1;

        for (let j = 0; j < phraseWords.length && (i + j) < textWords.length; j++) {
            const textWord = textWords[i + j];
            const phraseWord = phraseWords[j];

            if (textWord.includes(phraseWord) ||
                phraseWord.includes(textWord) ||
                levenshteinDistance(textWord, phraseWord) <= MAX_MATCH_DISTANCE) {
                matchCount++;
                lastMatchIndex = j;
            }
        }

        if (matchCount >= MIN_MATCH_WORDS && lastMatchIndex > maxMatchLength) {
            maxMatchLength = lastMatchIndex;
            bestMatchStart = i;
            bestMatchEnd = i + lastMatchIndex;
        }
    }

    if (bestMatchStart !== -1) {
        const matchedText = textWords.slice(bestMatchStart, bestMatchEnd + 1);
        const fullTextLower = text.toLowerCase();
        const matchSequence = matchedText.join(' ').toLowerCase();
        const startIndex = fullTextLower.indexOf(matchSequence);

        if (startIndex !== -1) {
            return {
                found: true,
                text: text.slice(startIndex, startIndex + matchSequence.length),
                startIndex: startIndex,
                length: matchSequence.length
            };
        }
    }

    return { found: false };
};

const Revisioning = ({ text, phrases, suggestions, attributePhrases, onTextChange }) => {
    const [currentText, setCurrentText] = useState(text);
    const [hoveredPhrase, setHoveredPhrase] = useState(null);
    const [replacedPhrases, setReplacedPhrases] = useState(new Set());

    useEffect(() => {
        setCurrentText(text);
    }, [text]);

    // Create maps for suggestions and attributes
    const suggestionMap = {};
    const phraseAttributeMap = new Map();

    // Map phrases to attributes
    Object.entries(attributePhrases).forEach(([attribute, phraseList]) => {
        phraseList.forEach(phrase => {
            phraseAttributeMap.set(phrase.toLowerCase(), attribute);
        });
    });

    // Create suggestion mappings
    Object.entries(suggestions).forEach(([attribute, replacements]) => {
        replacements.forEach(({ original, suggestion }) => {
            suggestionMap[original.toLowerCase()] = {
                suggestion,
                attribute
            };
            phraseAttributeMap.set(suggestion.toLowerCase(), attribute);
        });
    });

    // Create reverse mapping for replaced phrases
    const reverseMap = {};
    Object.entries(suggestionMap).forEach(([original, { suggestion, attribute }]) => {
        reverseMap[suggestion.toLowerCase()] = {
            original,
            attribute
        };
    });

    const handlePhraseClick = (phrase, isReplaced = false) => {
        const map = isReplaced ? reverseMap : suggestionMap;
        const phraseLower = phrase.toLowerCase();

        if (map[phraseLower]) {
            const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
            const newText = currentText.replace(regex, (match) => {
                const replacement = isReplaced ?
                    map[phraseLower].original :
                    map[phraseLower].suggestion;

                return match[0] === match[0].toUpperCase()
                    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
                    : replacement;
            });

            setCurrentText(newText);
            onTextChange?.(newText);

            const newReplacedPhrases = new Set(replacedPhrases);
            if (isReplaced) {
                newReplacedPhrases.delete(phraseLower);
            } else {
                newReplacedPhrases.add(map[phraseLower].suggestion.toLowerCase());
            }
            setReplacedPhrases(newReplacedPhrases);
            setHoveredPhrase(null);
        }
    };

    const renderText = () => {
        let result = [];
        let currentIndex = 0;
        const allPhrases = Array.from(phraseAttributeMap.keys());
        let matches = [];

        // Find all matches using the robust matching algorithm
        allPhrases.forEach(phrase => {
            const match = findBestMatch(phrase, currentText);
            if (match.found) {
                matches.push({
                    start: match.startIndex,
                    end: match.startIndex + match.length,
                    phrase: match.text,
                    isReplaced: replacedPhrases.has(phrase.toLowerCase()),
                    attribute: phraseAttributeMap.get(phrase.toLowerCase())
                });
            }
        });

        // Sort and filter overlapping matches
        matches.sort((a, b) => a.start - b.start);
        matches = matches.reduce((acc, match) => {
            if (!acc.length || match.start >= acc[acc.length - 1].end) {
                acc.push(match);
            }
            return acc;
        }, []);

        // Render text with matches
        matches.forEach((match, i) => {
            if (match.start > currentIndex) {
                result.push(currentText.slice(currentIndex, match.start));
            }

            const phrase = match.phrase;
            const isReplaced = match.isReplaced;
            const isHovered = phrase === hoveredPhrase;
            const attributeClass = match.attribute ? `mark-sensitive-${match.attribute}` : '';

            const suggestionText = isReplaced
                ? reverseMap[phrase.toLowerCase()]?.original
                : suggestionMap[phrase.toLowerCase()]?.suggestion;

            result.push(
                <span
                    key={i}
                    className="revisioning-phrase-wrapper"
                    style={{
                        display: 'inline-block',
                        position: 'relative'
                    }}
                >
                    <span
                        className={`revisioning-phrase ${attributeClass} 
                            ${isReplaced ? 'replaced' : ''} 
                            ${isHovered ? 'hovered' : ''}`}
                        onMouseEnter={() => setHoveredPhrase(phrase)}
                        onMouseLeave={() => setHoveredPhrase(null)}
                        onClick={() => handlePhraseClick(phrase, isReplaced)}
                    >
                        {phrase}
                        {isHovered && suggestionText && (
                            <span className="revisioning-suggestion">
                                <span className={`suggestion-text ${isReplaced ? 'original' : 'private'}`}>
                                    {suggestionText}
                                </span>
                                {isReplaced && (
                                    <span className="revert-icon">
                                        <RotateCcw size={12} />
                                    </span>
                                )}
                            </span>
                        )}
                    </span>
                </span>
            );

            currentIndex = match.end;
        });

        if (currentIndex < currentText.length) {
            result.push(currentText.slice(currentIndex));
        }

        return result;
    };

    return (
        <div className="revisioning-container">
            <div className="revisioning-text">
                {renderText()}
            </div>
        </div>
    );
};

// Helper functions
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

export default Revisioning;