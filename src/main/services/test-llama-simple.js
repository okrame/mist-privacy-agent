const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// DeepSeek specific chat template markers
const USER_TOKEN = '<｜User｜>';
const ASSISTANT_TOKEN = '<｜Assistant｜>';

const systemPrompt = `
Think step by step, but keep reasoning concise (under 20 words). Prefer direct answers over long explanations.`;

// const systemPrompt = `You are an AI assistant tasked with making text more privacy-preserving.
// First briefly explain your thinking, then provide the privacy-preserving version of the text on a new line.
// Do not use any XML tags in your response.`;

async function formatChatPrompt(systemPrompt, userInput) {
  // Format the full prompt using DeepSeek chat template
  return `${systemPrompt}${USER_TOKEN}${userInput}${ASSISTANT_TOKEN}`;
}

async function runChatTest() {
  const startTime = performance.now();
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
    const modelPath = path.join(process.cwd(), 'models/BartowskiDeepSeek-R1-Distill-Llama-8B-Q4_K_S.gguf');
    //const modelPath = path.join(process.cwd(), 'models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf');
    console.log('Loading model from:', modelPath);
    
    const modelLoadStart = performance.now();
    const model = await llama.loadModel({
      modelPath,
      contextSize: 2048,
      modelConfig: {
        temperature: 0.1,
        // Add specific DeepSeek parameters
        topP: 0.9,
        repeatPenalty: 1.1,
        presencePenalty: 0.0,
        frequencyPenalty: 0.0
      }
    });
    const modelLoadTime = performance.now() - modelLoadStart;
    console.log(`Model loaded in ${modelLoadTime.toFixed(2)}ms`);

    // Create context
    const context = await model.createContext();
    
    // Initialize chat session with custom template formatter
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt,
      chatWrapper: new Llama3_1ChatWrapper({
        noToolInstructions: true,
        // Add custom template formatter
        templateFormatter: async (messages) => {
          const formattedPrompt = await formatChatPrompt(
            messages.system || '',
            messages.prompt
          );
          return formattedPrompt;
        }
      })
    });

    try {
      console.log('Running inference...\n');
      console.log('Starting response stream:');
      
      const inferenceStart = performance.now();
      await session.prompt(text, {
        onToken: (token) => {
          const decoded = model.detokenize([token]);
          process.stdout.write(decoded); // Print tokens directly
        }
      });
      const inferenceTime = performance.now() - inferenceStart;
      
      console.log('\nInference completed in', inferenceTime.toFixed(2), 'ms');

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
  } finally {
    const totalTime = performance.now() - startTime;
    console.log(`\nTotal execution time: ${totalTime.toFixed(2)}ms`);
  }
}

// Run the test
runChatTest().catch(console.error);