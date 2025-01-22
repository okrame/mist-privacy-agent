export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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


export function highlightPhrases(text, phrases) {
    if (!phrases.length) return text;

    const tempDiv = document.createElement('div');
    tempDiv.textContent = text;

    // Split phrase into words
    const getWords = (phrase) => phrase.toLowerCase().split(/\s+/);

    // Create a pattern that matches the phrase with some flexibility
    const createPhrasePattern = (phrase, words) => {
        // Create pattern parts for each word
        const wordPatterns = words.map(word => `\\b${escapeRegExp(word)}\\b`);

        // Join with flexible whitespace
        const strictPattern = wordPatterns.join('\\s+');

        // For partial matches (when some words are missing/different)
        // we'll create patterns that match consecutive pairs of words
        const partialPatterns = [];
        for (let i = 0; i < words.length - 1; i++) {
            partialPatterns.push(
                `\\b${escapeRegExp(words[i])}\\b\\s+\\b${escapeRegExp(words[i + 1])}\\b`
            );
        }

        return {
            strict: new RegExp(strictPattern, 'gi'),
            partial: partialPatterns.map(p => new RegExp(p, 'gi'))
        };
    };

    // Process each phrase
    phrases.forEach(phrase => {
        if (!phrase) return;

        // Handle complete sentences (including punctuation)
        const isFullSentence = /[.!?]$/.test(phrase);
        if (isFullSentence) {
            // Create a safe pattern that includes possible punctuation
            const safePhrasePattern = new RegExp(escapeRegExp(phrase), 'gi');
            const textContent = tempDiv.textContent;

            // Wrap the entire matched sentence in a span
            tempDiv.innerHTML = textContent.replace(safePhrasePattern, match =>
                `<span class="mark-sensitive">${match}</span>`
            );
            return;
        }

        // Original word-by-word processing for non-sentence phrases
        const words = getWords(phrase);
        const patterns = createPhrasePattern(phrase, words);

        // Use TreeWalker to find text nodes
        const walker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }

        // Try strict match first
        let matches = [];
        nodes.forEach(textNode => {
            if (!textNode.parentNode) return; // Skip if no parent node

            const strictMatches = [...textNode.textContent.matchAll(patterns.strict)];
            if (strictMatches.length) {
                matches.push({ node: textNode, matches: strictMatches, type: 'strict' });
                return;
            }

            // If no strict match, try partial matches
            patterns.partial.forEach(pattern => {
                const partialMatches = [...textNode.textContent.matchAll(pattern)];
                if (partialMatches.length) {
                    matches.push({ node: textNode, matches: partialMatches, type: 'partial' });
                }
            });
        });

        // Process matches in reverse order
        matches.reverse().forEach(({ node: textNode, matches: textMatches, type }) => {
            if (!textNode.parentNode) return; // Skip if no parent node

            textMatches.reverse().forEach(match => {
                const span = document.createElement('span');
                span.className = 'mark-sensitive';
                if (type === 'partial') {
                    span.classList.add('partial-match');
                }

                const before = textNode.textContent.substring(0, match.index);
                const after = textNode.textContent.substring(match.index + match[0].length);

                const beforeNode = document.createTextNode(before);
                const afterNode = document.createTextNode(after);

                span.textContent = match[0];

                const parent = textNode.parentNode;
                parent.insertBefore(beforeNode, textNode);
                parent.insertBefore(span, textNode);
                parent.insertBefore(afterNode, textNode);
                parent.removeChild(textNode);
            });
        });
    });

    return tempDiv.innerHTML;
}

export function processProposal(text, analysedWords) {
    if (!text.includes('"proposal"') || !text.endsWith('}')) {
        return null;
    }

    try {
        // Match the entire proposal text - modified pattern to handle escaped quotes
        const proposalPattern = /"proposal"\s*:\s*"((?:[^"\\]|\\"|\\)*?)"/;
        const proposalMatch = text.match(proposalPattern);

        if (!proposalMatch) {
            console.log("No proposal match found");
            return null;
        }

        const proposalText = proposalMatch[1];
        console.log("Proposal text:", proposalText);

        // Step 1: Extract all quoted phrases from proposal text
        const quotedPattern = /\\"([^"\\]+)\\"/g;  // Pattern for escaped quotes
        const allQuotedWords = [];
        let match;

        while ((match = quotedPattern.exec(proposalText)) !== null) {
            allQuotedWords.push(match[1]);
        }

        console.log("All quoted words:", allQuotedWords);

        // Step 2: Remove words that are in analysedWords to get replacementWords
        const replacementWords = allQuotedWords.filter(word =>
            !analysedWords.includes(word)
        );

        const suggestions = {};
        analysedWords.forEach((analysedWord, index) => {
            suggestions[analysedWord] = [];

            if (index < replacementWords.length) {
                suggestions[analysedWord].push(replacementWords[index]);
            }

            if (index + 1 < replacementWords.length) {
                suggestions[analysedWord].push(replacementWords[index + 1]);
            }

            if (replacementWords.length < analysedWords.length && index > 0) {
                const prevWord = replacementWords[index - 1];
                if (prevWord && !suggestions[analysedWord].includes(prevWord)) {
                    suggestions[analysedWord].unshift(prevWord);
                }
            }
        });

        console.log("Original analysed words:", analysedWords);
        console.log("Extracted replacement words:", replacementWords);
        console.log("Mapped suggestions:", suggestions);

        return {
            analysedWords,
            replacementWords,
            suggestions
        };

    } catch (e) {
        console.log("Error processing proposal:", e);
        return null;
    }
}
