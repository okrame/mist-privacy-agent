const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const systemPrompt = `You are an AI assistant tasked with making text more privacy-preserving. 
You must keep your thinking brief`;

async function runChatTest() {
  try {
    // Get input text from command line
    const text = process.argv[2];
    if (!text) {
      console.error('Please provide a text to analyze as a command line argument');
      process.exit(1);
    }

    console.log('\nAnalyzing text:', text, '\n');

    // Import and initialize llama
    const { getLlama, LlamaChatSession, Llama3_1ChatWrapper } = await import('node-llama-cpp');
    const llama = await getLlama();

    // Load model
    const modelPath = path.join(process.cwd(), 'models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf');
    console.log('Loading model from:', modelPath);

    const model = await llama.loadModel({
      modelPath,
      contextSize: 2048,
      modelConfig: {
        temperature: 0.1,
      }
    });

    // Create JSON schema grammar
    const grammar = await llama.createGrammarForJsonSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        thinking: {
          type: "string",
          description: "Your reasoning process"
        },
        response: {
          type: "string", 
          description: "The privacy-preserving version of the text"
        }
      },
      required: ["thinking", "response"],
      // Add these to ensure proper JSON formatting
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#"
    });

    // Create context and session
    const context = await model.createContext();
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt,
      chatWrapper: new Llama3_1ChatWrapper({
        noToolInstructions: true  // Disable any tool-related instructions
      })
    });

    try {
      console.log('Running inference...\n');

      // Run inference with streaming
      let accumulatedText = '';
      console.log('Starting response stream:');
      
      const response = await session.prompt(text, {
        grammar,
        onToken: (token) => {
          const decoded = model.detokenize([token]);
          //process.stdout.write(decoded); // Print raw tokens for debugging
          accumulatedText += decoded;
        }
      });

      // Print final parsed response
      console.log('\n\nFinal accumulated text:', accumulatedText);
      
      try {
        // Clean up JSON before parsing
        const cleanedText = accumulatedText
        .replace(/!(\w+)":/g, '"$1":')  // Fix !key": to "key":
        .replace(/[\r\n]/g, ' ')        // Remove newlines
        .replace(/\s+/g, ' ')           // Normalize spaces
        .replace(/\\+"/g, '\\"')        // Fix escaped quotes
        .trim();
        
        const parsed = JSON.parse(cleanedText);
        // Single, clean console output
        console.log('\nReasoning:', parsed.thinking);
        console.log('\nParsed proposal:', parsed.response);

      } catch (e) {
        console.error('Error parsing response:', e);
      }

      console.log('\nDone!');

    } catch (error) {
      console.error('Error during inference:', error);
    } finally {
      // Cleanup
      await context.dispose();
      await model.dispose();
      await llama.dispose();
    }

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the test
runChatTest().catch(console.error);