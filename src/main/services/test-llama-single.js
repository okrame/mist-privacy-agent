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

const systemPrompt = `You are an analytical AI trained to infer personal attributes from text through careful reasoning.

For each identified attribute (${ATTRIBUTES.join(', ')}), provide your analysis in this format:

{
  "[attribute_name]": {
    "estimate": "inferred value",
    "confidence": 1-5 (5 being highest),
    "analysis": "key phrases supporting your inference",
    "explanation": "brief logical reasoning chain",
    "proposal": {"original": "exact same original key phrase", "replacement": "new privacy-preserving phrase"}
  }
}

Only include attributes where you can make reasonable inferences. Skip attributes entirely if there's insufficient evidence.
Your reasoning should be super short.`;

const systemPrompt0 = `You are an analytical AI trained to infer personal attributes from text through careful reasoning.

For each identified attribute, provide:
- estimate: your inferred value  
- confidence: 1-5 (5 being highest)
- analysis: key phrases supporting your inference
- explanation: brief logical reasoning chain
- proposal: suggested rephrasing for privacy

Think step-by-step.
Remember: There can be more than one attribute to be inferred, or there can be none`;


async function runTests() {
  let llama = null;
  let model = null;

  try {
    // Get input text from command line
    const text = process.argv[2];
    if (!text) {
      console.error('Please provide a text to analyze as a command line argument');
      process.exit(1);
    }

    console.log('\nAnalyzing text:', text, '\n');

    // Import and initialize llama
    const { getLlama } = await import('node-llama-cpp');
    llama = await getLlama();
    
    // Load model - using the same model path as in your project
    const modelPath = path.join(process.cwd(), 'models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf');
    //const modelPath = path.join(process.cwd(), 'models/unsloth.llama8Breason.Q4_K_M.gguf');

    console.log('Loading model from:', modelPath);
    
    model = await llama.loadModel({
      modelPath,
      contextSize: 4096,
      encoding: 'utf8'
    });

    // Get JSON grammar
    const jsonGrammar = await llama.getGrammarFor("json");

    // Start timing
    const startTime = process.hrtime.bigint();

    try {
      // Create context and session
      const context = await model.createContext();
      const { LlamaChatSession } = await import('node-llama-cpp');
      const sequence = context.getSequence();
      
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt
      });

      // Run inference
      console.log('Running inference...');
      const response = await session.prompt(text, {
        grammar: jsonGrammar
      });

      // Calculate timing
      const endTime = process.hrtime.bigint();
      const inferenceTime = Number(endTime - startTime) / 1e6;

      // Parse and display results
      const result = JSON.parse(response);
      console.log('\nResults:');
      console.log(JSON.stringify(result, null, 2));
      console.log(`\nTotal inference time: ${inferenceTime.toFixed(2)} ms`);

      // Cleanup
      await sequence.dispose();
      await context.dispose();

    } catch (error) {
      console.error('Error during inference:', error);
    }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Cleanup
    if (model) await model.dispose();
    if (llama) await llama.dispose();
  }
}

// Run the test
runTests().catch(console.error);