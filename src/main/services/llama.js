const { app } = require('electron');
const path = require('path');

const agent1SystemPrompt = `
You are a specialized AI assistant trained to analyze text for personal attribute inference and provide detailed analysis.

IMPORTANT: Only include attributes in your JSON output where you can make a reasonable inference. There can be more than one inferred attribute. Skip attributes entirely if there's insufficient evidence.
`;

// const agent1SystemPrompt = `You are a specialized AI assistant trained to analyze text for personal attribute inference and provide detailed analysis.
// IMPORTANT: 
// - Only include attributes in your JSON output where you can make a reasonable inference. There can be more than one inferred attribute. Skip attributes entirely if there's insufficient evidence.
// - You MUST answer considering the user's profile information.
// `;


let llama = null;
let model = null;
let jsonGrammar = null;
let currentSession = null;


// Models
const testmodel = "unsloth.llama3b.Q4_K_M.smalljson.proposals.gguf";
//const testmodel = "unsloth.llama3b.Q4_K_M.smalljson.proposals_2GT.gguf"; 

function getModelStatus() {
  return { ready: model !== null && llama !== null };
}

let isProcessing = false;
let processingPromise = null;

async function stopInference() {
  try {
    if (currentSession && isProcessing) {
      console.log('Interrupting current session...');
      isProcessing = false;

      if (currentSession.session?.contextSequence) {
        await currentSession.session.contextSequence.interrupt();
      }

      // Wait for the actual processing to complete
      if (processingPromise) {
        try {
          await processingPromise;
        } catch (error) {
          // Expected error from interruption
          console.log('Processing interrupted successfully');
        }
      }

      await cleanupSession(currentSession);
      currentSession = null;
    }
    return true;
  } catch (error) {
    console.error('Error during inference stop:', error);
    isProcessing = false;
    processingPromise = null;
    currentSession = null;
    throw error;
  }
}


async function initializeLlama() {
  try {
    if (model && llama) {
      console.log('Model already initialized, reusing existing instance');
      return true;
    }

    if (global.gc) {
      global.gc();
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

    const baseModelDir = app.isPackaged
      ? path.join(process.resourcesPath, 'models')
      : path.join(__dirname, '../../models');

    console.log('Loading model from:', baseModelDir);
    logMemoryUsage('Before model1 load');

    model = await llama.loadModel({
      modelPath: path.join(baseModelDir, testmodel),
      contextSize: 2048,
      //temperature: 0.1,
      //topP: 0.9,// default is 0.95, allow the model to consider a good range of relevant tokens while filtering out unlikely ones,
      //repeat_penalty: 1.1, // Avoid repetitive analysis
      encoding: 'utf8'
    });

    console.log('Model loaded successfully');
    logMemoryUsage('After model1 load');

    if (global.gc) {
      global.gc();
    }

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
    await sessionObj.session.prompt("This is a simple test message. DO NOT ANSWER.", {
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
  if (!sessionObj) return;

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

  // Small delay to ensure cleanup is complete
  await new Promise(resolve => setTimeout(resolve, 100));
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
  // const groundTruth = {
  //   age: "24",
  //   sex: "female", 
  //   city_country: "Monterey, California",
  //   birth_city_country: "Kumasi",
  //   education: "studying towards a Bachelors in Nursing",
  //   occupation: "part-time care aide",
  //   relationship_status: "single",
  //   income_level: "low"
  // };

  // const groundTruthStr = JSON.stringify(groundTruth);
  // text = `My Profile: ${groundTruthStr}\n\n${text}`;

  const tokenCount = await model.tokenize(text);
  if (tokenCount.length > 1024) {
    throw new Error("Input too long - please reduce length");
  }

  console.log('Running agent with text:', text);
  const startTime = process.hrtime.bigint();

  let sessionObj = null;

  try {
    // Always create a new session for each analysis
    sessionObj = await createNewSession();
    let accumulator = '';

    const response = await sessionObj.session.prompt(text, {
      grammar: jsonGrammar,
      onTextChunk: (chunk) => {
        const decodedChunk = chunk.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
          String.fromCodePoint(parseInt(hex, 16))
        );

        accumulator += decodedChunk;
        try {
          // Try to parse the accumulated JSON
          const parsedJson = JSON.parse(accumulator);
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: true,
            data: parsedJson
          });
        } catch (e) {
          // If we can't parse it yet, just send the chunk
          window.webContents.send('analysisChunk', {
            text: decodedChunk,
            isComplete: false
          });
        }
      }
    });

    // Handle successful completion
    const decodedResponse = response.replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    );

    const endTime = process.hrtime.bigint();
    const inferenceTime = Number(endTime - startTime) / 1e6;

    const parsedResponse = JSON.parse(decodedResponse);
    console.log('Agent completed successfully. Response:', parsedResponse);
    console.log('Inference time: ', inferenceTime);

    return {
      response: parsedResponse,
      inferenceTime
    };
  } catch (error) {
    console.error('Error running agent:', error);
    throw error;
  } finally {
    // Always clean up the session after use
    if (sessionObj) {
      await cleanupSession(sessionObj);
    }
  }
}



async function dispose() {
  if (model) {
    try {
      await model.dispose();
      model = null;
      // Force cleanup
      if (global.gc) global.gc();
    } catch (e) {
      console.warn('Error disposing model:', e);
    }
  }

  // Add a small delay before disposing llama
  await new Promise(resolve => setTimeout(resolve, 300));

  if (llama) {
    try {
      await llama.dispose();
      llama = null;
      if (global.gc) global.gc();
    } catch (e) {
      console.warn('Error disposing llama:', e);
    }
  }
}

function logMemoryUsage(label) {
  const used = process.memoryUsage();
  console.log(`Memory usage (${label}):`);
  for (let key in used) {
    console.log(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }
}

// Update the module exports:
module.exports = {
  initializeLlama,
  runAgent,
  dispose,
  getModelStatus,
  stopInference
};