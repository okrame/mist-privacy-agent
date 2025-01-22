const { app } = require('electron');
const path = require('path');

const agent1SystemPrompt = `
You are a specialized AI assistant trained to analyze text for personal attribute inference and provide detailed analysis.

IMPORTANT: Only include attributes in your JSON output where you can make a reasonable inference. There can be more than one inferred attribute. Skip attributes entirely if there's insufficient evidence.
`;

let llama = null;
let model = null;
let jsonGrammar = null;

const testmodel = "unsloth.llama3b.Q4_K_M.smalljson.gguf";

function getModelStatus() {
  return { ready: model !== null && llama !== null };
}


async function initializeLlama() {
  try {
    if (model && llama) {
      console.log('Model already initialized, reusing existing instance');
      return true;
    }
    const { getLlama } = await import('node-llama-cpp');

    if (llama) {
      console.log('Disposing old Llama instance...');
      await llama.dispose();
    }
    console.log('Creating new Llama instance...');
    llama = await getLlama();
    
    if (model) {
      console.log('Disposing old model...');
      await model.dispose();
    }

    console.log('Loading model from:', path.join(__dirname, '../../models'));
    model = await llama.loadModel({
      modelPath: path.join(
        app.isPackaged 
          ? process.resourcesPath 
          : path.join(__dirname, '../../models'), 
        testmodel
      ),
      contextSize: 1024,
      encoding: 'utf8' 
    });
    console.log('Model loaded successfully');

    jsonGrammar = await llama.getGrammarFor("json");
    await preWarmModel();
    
    console.log('Llama model initialized and pre-warmed successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Llama:', error);
    return false;
  }
}

async function preWarmModel() {
  console.log('Pre-warming model...');
  let sessionObj = null;
  
  try {
    sessionObj = await createNewSession();
    await sessionObj.session.prompt("This is a simple test message.", {
      grammar: jsonGrammar,
    });
    console.log('Model pre-warming complete');
  } catch (error) {
    console.warn('Model pre-warming failed:', error);
  } finally {
    if (sessionObj) {
      await cleanupSession(sessionObj);
    }
  }
}

async function cleanupSession(sessionObj) {
  if (sessionObj.session?.contextSequence) {
    try {
      await sessionObj.session.contextSequence.dispose();
    } catch (e) {
      console.warn('Error disposing context sequence:', e);
    }
  }
  if (sessionObj.context) {
    try {
      await sessionObj.context.dispose();
    } catch (e) {
      console.warn('Error disposing context:', e);
    }
  }
}

async function createNewSession() {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await model.createContext();
  try {
    const sequence = context.getSequence();
    return {
      session: new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: agent1SystemPrompt
      }),
      context: context
    };
  } catch (error) {
    if (context) {
      try {
        await context.dispose();
      } catch (e) {
        console.warn('Error disposing context during error handling:', e);
      }
    }
    throw error;
  }
}

async function runAgent(text, window) {
  const tokenCount = await model.tokenize(text);
  if (tokenCount.length > 1024) {
    throw new Error("Input too long - please reduce length");
  }
  
  console.log('Running agent with text:', text);
  const startTime = process.hrtime.bigint();
  let sessionObj = null;
  
  try {
    sessionObj = await createNewSession();

    let accumulator = '';
    
    const response = await sessionObj.session.prompt(text, {
      grammar: jsonGrammar,
      onTextChunk: (chunk) => {
        // Decode Unicode escape sequences
        const decodedChunk = chunk.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) => 
          String.fromCodePoint(parseInt(hex, 16))
        );
        
        accumulator += decodedChunk;
        try {
          JSON.parse(accumulator);
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: true
          });
        } catch (e) {
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: false
          });
        }
      }
    });

    // Decode the full response before parsing
    const decodedResponse = response.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) => 
      String.fromCodePoint(parseInt(hex, 16))
    );
    
    const endTime = process.hrtime.bigint();
    const inferenceTime = Number(endTime - startTime) / 1e6;
    
    console.log(`Agent inference time: ${inferenceTime.toFixed(2)} ms`);
    console.log('Agent output:', decodedResponse);

    return {
      response: JSON.parse(decodedResponse),
      inferenceTime
    };
  } catch (error) {
    console.error('Error running agent:', error);
    throw error;
  } finally {
    if (sessionObj) {
      await cleanupSession(sessionObj);
    }
  }
}

async function dispose() {
  if (model) {
    try {
      await model.dispose();
    } catch (e) {
      console.warn('Error disposing model:', e);
    }
  }
  if (llama) {
    try {
      await llama.dispose();
    } catch (e) {
      console.warn('Error disposing llama:', e);
    }
  }
}

module.exports = {
  initializeLlama,
  runAgent,
  dispose,
  getModelStatus
};