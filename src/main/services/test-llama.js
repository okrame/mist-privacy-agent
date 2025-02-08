const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const ATTRIBUTES = [
  'age',
  'sex',
  'city_country',
  'birth_city_country',
  'education',
  'occupation',
  'relationship_status',
  'income_level'
];

// Create system prompts for each attribute
const createSystemPrompt = (attribute) => `You are a specialized AI assistant trained to analyze text for ${attribute} inference.

IMPORTANT: Only include the ${attribute} attribute in your JSON output where you can make a reasonable inference. Skip the attribute entirely if there's insufficient evidence.

Format your response as either:
{
  "${attribute}": {
    "estimate": "inferred value",
    "confidence": 1-5 (5 being highest),
    "analysis": "key phrases that support your inference",
    "explanation": "brief logical reasoning chain"
    "proposal" ": {"original": "exact same original key phrase", "replacement": "new privacy-preserving phrase"}
  }
}
  
Or:
{
  "${attribute}": "impossible to infer"
}


`;

async function runTests() {
  let llama = null;
  let model = null;

  try {
    // Import and initialize llama
    const { getLlama } = await import('node-llama-cpp');
    llama = await getLlama();
    
    // Load model
    model = await llama.loadModel({
        modelPath: path.join(process.cwd(), 'models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf'),
        contextSize: 4096,
      encoding: 'utf8'
    });

    // Get JSON grammar
    const jsonGrammar = await llama.getGrammarFor("json");

    // Get user input
    const text = process.argv[2];
    if (!text) {
      console.error('Please provide a text to analyze as a command line argument');
      process.exit(1);
    }

    console.log('\nStarting analysis for text:', text, '\n');

    // Run analysis for each attribute
    for (const attribute of ATTRIBUTES) {
      console.log(`\n=== Analyzing ${attribute.toUpperCase()} ===`);
      const startTime = process.hrtime.bigint();

      try {
        // Create context and session for this run
        const context = await model.createContext();
        const { LlamaChatSession } = await import('node-llama-cpp');
        const sequence = context.getSequence();
        
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: createSystemPrompt(attribute)
        });

        // Run inference
        const response = await session.prompt(text, {
          grammar: jsonGrammar
        });

        // Calculate and display timing
        const endTime = process.hrtime.bigint();
        const inferenceTime = Number(endTime - startTime) / 1e6;

        // Parse and display results
        const result = JSON.parse(response);
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log(`Inference time: ${inferenceTime.toFixed(2)} ms`);

        // Cleanup
        await sequence.dispose();
        await context.dispose();

      } catch (error) {
        console.error(`Error analyzing ${attribute}:`, error);
      }
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Cleanup
    if (model) await model.dispose();
    if (llama) await llama.dispose();
  }
}

// Run the tests
runTests().catch(console.error);