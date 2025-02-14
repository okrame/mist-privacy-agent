export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Add Levenshtein distance calculation
export function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,  // substitution
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1       // insertion
                );
            }
        }
    }
    return dp[m][n];
}

export function findBestSuggestion(phrase, suggestionMap) {
    const phraseLower = phrase.toLowerCase();
    
    // First try exact match
    if (suggestionMap[phraseLower]) {
        return suggestionMap[phraseLower];
    }

    // If no exact match, try fuzzy matching
    let bestMatch = null;
    let bestDistance = Infinity;
    const similarityThreshold = 0.8; // 80% similarity required

    Object.entries(suggestionMap).forEach(([original, data]) => {
        const distance = levenshteinDistance(phraseLower, original);
        const maxLength = Math.max(phraseLower.length, original.length);
        const similarity = 1 - (distance / maxLength);

        if (similarity >= similarityThreshold && distance < bestDistance) {
            bestDistance = distance;
            bestMatch = data;
        }
    });

    return bestMatch;
}

// Modified findBestMatch function with fuzzy matching
export function findBestMatch(phrase, text) {
    // 1. Try exact word boundary matching first
    if (!phrase.includes(' ')) {
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
    }

    // 2. Try exact phrase matching
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

    // 3. If no exact match, try fuzzy matching
    const words = text.split(/\s+/);
    const phraseWords = phrase.toLowerCase().split(/\s+/);

    let bestMatch = {
        found: false,
        distance: Infinity,
        text: '',
        startIndex: -1
    };

    // Search for best matching sequence
    for (let i = 0; i < words.length; i++) {
        // Try matching sequences of similar length to our phrase
        const maxSequenceLength = phraseWords.length + 1;
        for (let j = 1; j <= maxSequenceLength && i + j <= words.length; j++) {
            const sequence = words.slice(i, i + j).join(' ');
            const distance = levenshteinDistance(sequence.toLowerCase(), phrase.toLowerCase());

            // Calculate similarity ratio (0 to 1)
            const maxLength = Math.max(sequence.length, phrase.length);
            const similarity = 1 - (distance / maxLength);

            // Update best match if this is better
            // Require at least 80% similarity to consider it a match
            if (similarity >= 0.8 && distance < bestMatch.distance) {
                // Find the actual position in original text
                const startIndex = text.toLowerCase().indexOf(sequence.toLowerCase());
                if (startIndex !== -1) {
                    bestMatch = {
                        found: true,
                        distance: distance,
                        text: text.slice(startIndex, startIndex + sequence.length),
                        startIndex: startIndex,
                        length: sequence.length
                    };
                }
            }
        }
    }

    return bestMatch;
}

// Modified findMatches function to use fuzzy matching results
export function findMatches(text, phrases, attributeMap) {
    const matches = [];
    phrases.forEach(phrase => {
        const match = findBestMatch(phrase, text);
        if (match.found) {
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

                    console.log('Processing proposal:', {
                        original,
                        originalLength: original.length,
                        originalChars: [...original].map(c => c.charCodeAt(0))
                    });

                    // Split the original phrase into potential sub-phrases
                    const subPhrases = original.split(/\s+/).reduce((acc, word, idx, arr) => {
                        // Add individual words and combinations
                        if (idx === 0) {
                            // For first word, look ahead to create a pair
                            if (arr[idx + 1]) {
                                acc.push(`${word} ${arr[idx + 1]}`);
                            }
                        } else if (idx < arr.length - 1) {
                            // For middle words, create combinations with next words
                            acc.push(`${arr.slice(idx).join(' ')}`);
                        }
                        return acc;
                    }, []);

                    // Check both the full phrase and its sub-phrases
                    const matchingPhrases = [original, ...subPhrases].filter(phrase =>
                        analysedWords.includes(phrase)
                    );

                    if (matchingPhrases.length > 0) {
                        if (!suggestions[attribute]) {
                            suggestions[attribute] = [];
                        }

                        // Add the same suggestion for each matching phrase
                        matchingPhrases.forEach(phrase => {
                            suggestions[attribute].push({
                                original: phrase,
                                suggestion: suggestionText
                            });
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