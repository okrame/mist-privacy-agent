const { app } = require('electron');
const path = require('path');

// Define a more specific system prompt for privacy preservation
const privacySystemPrompt = `You are an AI assistant specialized in privacy preservation.
Your task is to rewrite text while maintaining:
1. The exact same length (within 10% of original character count)
2. Similar level of specific details and complexity
3. Equivalent writing style and tone

Guidelines:
- Replace sensitive details with equivalent but privacy-preserving alternatives
- Match the original text's format and structure
- Ensure the rewritten text can stand alone as a coherent narrative

Keep your thinking brief and focus on the rewrite.`;

// const privacySystemPrompt = `You are an AI assistant specialized in privacy preservation.
// Keep your thinking quite brief.
// Keep the style and tone similar to the original text.`;

let llama2 = null;
let privacyModel = null;

function getModel2Status() {
  return { ready: privacyModel !== null && llama2 !== null };
}

async function initializeLlama2() {
  try {
    if (privacyModel && llama2) {
      console.log('Privacy model already initialized');
      return true;
    }

    if (global.gc) {
      global.gc();
    }

    const { getLlama } = await import('node-llama-cpp');

    if (llama2) {
      await llama2.dispose();
    }
    llama2 = await getLlama();
    
    if (privacyModel) {
      await privacyModel.dispose();
    }

    console.log('Loading privacy model...');
    privacyModel = await llama2.loadModel({
      modelPath: path.join(
        app.isPackaged 
          ? process.resourcesPath 
          : path.join(__dirname, '../../models'), 
        'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf'
      ),
      contextSize: 2048,
      temperature: 0.2
    });

    if (global.gc) {
      global.gc();
    }

    return true;
  } catch (error) {
    console.error('Error initializing privacy model:', error);
    return false;
  }
}

async function createPrivacySession() {
  const { LlamaChatSession, Llama3_1ChatWrapper } = await import('node-llama-cpp');
  const context = await privacyModel.createContext();
  
  try {
    const sequence = context.getSequence();
    return {
      session: new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: privacySystemPrompt,
        chatWrapper: new Llama3_1ChatWrapper({
          noToolInstructions: true
        })
      }),
      context: context
    };
  } catch (error) {
    if (context) {
      await context.dispose();
    }
    throw error;
  }
}

async function runPrivacyAgent(text, attributes, window) {
  console.log('Running privacy agent with attributes:', attributes);
  const startTime = process.hrtime.bigint();
  let sessionObj = null;

  try {
    sessionObj = await createPrivacySession();
    let prompt = `Change the following text so that nobody can infer or guess these attributes: ${attributes.join(', ')}.\n\nText: "${text}"`;

    let accumulatedText = '';
    const response = await sessionObj.session.prompt(prompt, {
      onToken: (token) => {
        const decoded = privacyModel.detokenize([token]);
        accumulatedText += decoded;        
        // Send intermediate chunks to the renderer
        window.webContents.send('privacyChunk', {
          text: decoded,
          isComplete: false
        });
      }
    });

    console.log("debug - raw response agent2: ", response);

    // Extract the final answer (after </think> tag)
    const thinkTagIndex = accumulatedText.lastIndexOf('</think>');
    const finalAnswer = thinkTagIndex !== -1 
      ? accumulatedText.substring(thinkTagIndex + 8).trim()
      : accumulatedText.trim();

    const endTime = process.hrtime.bigint();
    const inferenceTime = Number(endTime - startTime) / 1e6;
    
    console.log(`Privacy agent inference time: ${inferenceTime.toFixed(2)} ms`);
    console.log('Privacy agent response:', finalAnswer);

    return {
      response: finalAnswer,
      inferenceTime
    };
  } catch (error) {
    console.error('Error running privacy agent:', error);
    throw error;
  } finally {
    if (sessionObj) {
      if (sessionObj.session?.contextSequence) {
        await sessionObj.session.contextSequence.dispose();
      }
      if (sessionObj.context) {
        await sessionObj.context.dispose();
      }
    }
  }
}

async function dispose() {
  if (privacyModel) {
    try {
      await privacyModel.dispose();
      privacyModel = null;
      if (global.gc) global.gc();
    } catch (e) {
      console.warn('Error disposing privacy model:', e);
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (llama2) {
    try {
      await llama2.dispose();
      llama2 = null;
      if (global.gc) global.gc();
    } catch (e) {
      console.warn('Error disposing llama2:', e);
    }
  }
}

module.exports = {
  initializeLlama2,
  runPrivacyAgent,
  dispose,
  getModel2Status
};