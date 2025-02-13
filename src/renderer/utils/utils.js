export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

    // Existing phrase matching logic
    const phraseWords = phrase.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);

    let maxMatchLength = 0;
    let bestMatchStart = -1;
    let bestMatchEnd = -1;

    const MIN_MATCH_WORDS = phraseWords.length === 1 ?
        1 : // Single word requires exact match
        Math.ceil(phraseWords.length * 0.7); // Multiple words require 70% match

    const MAX_MATCH_DISTANCE = phraseWords.length === 1 ?
        0 : // Single word requires exact match
        1;  // Multiple words allow small variations

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

// for word similarity
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

export function extractExplanation(text) {
    // Extract explanations for each attribute with proper handling of escaped quotes
    const attributePattern = /"([^"]+)":\s*{[^}]*"explanation":\s*"((?:[^"\\]|\\"|\\)*?)"/g;
    const explanations = new Map();

    let match;
    while ((match = attributePattern.exec(text)) !== null) {
        const [_, key, explanation] = match;
        // Replace escaped quotes and decode Unicode escapes
        const cleanExplanation = explanation
            .replace(/\\"/g, '"')
            .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
                String.fromCodePoint(parseInt(hex, 16))
            )
            .trim();
        explanations.set(key, cleanExplanation);
    }

    return explanations;
}


// Map of attributes to their corresponding CSS classes
const attributeClassMap = {
    'age': 'mark-sensitive',
    'sex': 'mark-sensitive-alt1',
    'city_country': 'mark-sensitive-alt2',
    'birth_city_country': 'mark-sensitive-alt3',
    'education': 'mark-sensitive-alt4',
    'occupation': 'mark-sensitive-alt5',
    'relationship_status': 'mark-sensitive-alt6',
    'income_level': 'mark-sensitive-alt7'
};

const allHighlightClasses = [
    'mark-sensitive',
    'mark-sensitive-alt1',
    'mark-sensitive-alt2',
    'mark-sensitive-alt3',
    'mark-sensitive-alt4',
    'mark-sensitive-alt5',
    'mark-sensitive-alt6',
    'mark-sensitive-alt7'
];

const dynamicAttributeMap = new Map();

function getHighlightClass(attribute, usedAttributes) {
    if (attributeClassMap[attribute]) {
        return attributeClassMap[attribute];
    }

    if (dynamicAttributeMap.has(attribute)) {
        return dynamicAttributeMap.get(attribute);
    }

    // Get all classes currently in use by the standard and dynamic attributes
    const usedClasses = new Set([
        ...Object.entries(attributeClassMap)
            .filter(([key]) => usedAttributes.includes(key))
            .map(([_, value]) => value),
        ...Array.from(dynamicAttributeMap.values())
    ]);

    const availableClasses = allHighlightClasses.filter(cls => !usedClasses.has(cls));

    // Randomly select one of the available classes
    const randomIndex = Math.floor(Math.random() * availableClasses.length);
    const selectedClass = availableClasses[randomIndex] || 'mark-sensitive'; // Fallback if no classes available
    dynamicAttributeMap.set(attribute, selectedClass);

    return selectedClass;
}


export function highlightPhrases(text, phrases, attributePhrases) {
    if (!phrases.length) return text;

    const tempDiv = document.createElement('div');
    tempDiv.textContent = text;

    // Get all attributes currently in use
    const usedAttributes = Object.keys(attributePhrases);

    const getAttributeForPhrase = (phrase) => {
        for (const [attr, phraseList] of Object.entries(attributePhrases)) {
            if (phraseList.includes(phrase)) {
                return attr;
            }
        }
        return null;
    };

    const matches = [];

    phrases.forEach(phrase => {
        if (!phrase) return;

        const attribute = getAttributeForPhrase(phrase);
        const highlightClass = attribute ? 
            getHighlightClass(attribute, usedAttributes) : 
            'mark-sensitive';

        const bestMatch = findBestMatch(phrase, tempDiv.textContent);

        if (bestMatch.found) {
            const overlaps = matches.some(existingMatch => {
                const newStart = bestMatch.startIndex;
                const newEnd = bestMatch.startIndex + bestMatch.length;
                const existingStart = existingMatch.startIndex;
                const existingEnd = existingMatch.startIndex + existingMatch.length;

                return (newStart >= existingStart && newStart <= existingEnd) ||
                    (newEnd >= existingStart && newEnd <= existingEnd) ||
                    (existingStart >= newStart && existingStart <= newEnd);
            });

            if (!overlaps) {
                matches.push({
                    startIndex: bestMatch.startIndex,
                    length: bestMatch.length,
                    class: highlightClass,
                    text: bestMatch.text
                });
            }
        }
    });

    // Sort matches by start index in reverse order (to handle overlapping matches)
    matches.sort((a, b) => b.startIndex - a.startIndex);

    // Apply highlights
    let content = tempDiv.textContent;
    matches.forEach(match => {
        const before = content.substring(0, match.startIndex);
        const matchText = content.substring(match.startIndex, match.startIndex + match.length);
        const after = content.substring(match.startIndex + match.length);

        content = `${before}<span class="${match.class}">${matchText}</span>${after}`;
    });

    tempDiv.innerHTML = content;
    return tempDiv.innerHTML;
}

export function processProposal(text, analysedWords) {
    if (!text.includes('"inferable"') || !text.endsWith('}')) {
        return null;
    }

    try {
        const data = JSON.parse(text);
        
        if (!data.inferable) {
            return null;
        }

        const suggestions = {};

        // Process each inferable attribute
        Object.entries(data.inferable).forEach(([attribute, info]) => {
            if (!info.proposal) return;

            try {
                // Clean and parse the proposal string
                const proposalStr = info.proposal
                    .replace(/'/g, '"')
                    .replace(/\[|\]/g, '')
                    .split('},')
                    .map(item => item.endsWith('}') ? item : item + '}')
                    .filter(item => item.trim());

                // Process each replacement pair
                proposalStr.forEach(itemStr => {
                    const replacement = JSON.parse(itemStr);
                    const { original, replacement: suggestionText } = replacement;

                    if (analysedWords.includes(original)) {
                        if (!suggestions[attribute]) {
                            suggestions[attribute] = [];
                        }
                        suggestions[attribute].push({
                            original,
                            suggestion: suggestionText
                        });
                    }
                });
            } catch (e) {
                console.error(`Error processing proposal for ${attribute}:`, e);
            }
        });

        return suggestions;

    } catch (e) {
        console.error("Error processing proposal:", e);
        return null;
    }
}