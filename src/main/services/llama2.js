const { app } = require('electron');
const path = require('path');

const privacySystemPrompt = `You are a smart AI assistant.
Your MUST think and reason briefly`;

const USER_TOKEN = '<｜User｜>';
const ASSISTANT_TOKEN = '<｜Assistant｜>';

let llama2 = null;
let privacyModel = null;

function getModel2Status() {
  return { ready: privacyModel !== null && llama2 !== null };
}

async function formatChatPrompt(systemPrompt, userInput) {
  return `${systemPrompt}${USER_TOKEN}${userInput}${ASSISTANT_TOKEN}`;
}

async function preWarmPrivacyModel() {
  console.log('Pre-warming Agent2 model...');
  let sessionObj = null;

  try {
    sessionObj = await createPrivacySession();
    //  test prompt to warm up the model
    const warmupPrompt = "This is a test sentence for warming up. Do not answer";
    await sessionObj.session.prompt(warmupPrompt, {
      onToken: () => { } 
    });
    console.log('Agent2 model pre-warming complete');
  } catch (error) {
    console.warn('Agent2 model pre-warming failed:', error);
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


async function initializeLlama2() {
  try {
    if (privacyModel && llama2) {
      console.log('Agent2 model already initialized');
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

    const baseModelDir = app.isPackaged
      ? path.join(app.getPath('userData'), 'models')
      : path.join(__dirname, '../../models');

    console.log('Loading agent2 model from:', baseModelDir);
    privacyModel = await llama2.loadModel({
      modelPath: path.join(
        baseModelDir,
        'DeepSeek-R1-Distill-Llama-8B-Q4_K_S.gguf'
      ),
      contextSize: 2048,
      modelConfig: {
        temperature: 0.2,
        topP: 0.9,
        repeatPenalty: 1.1,
        presencePenalty: 0.0,
        frequencyPenalty: 0.0
      }
    });

    if (global.gc) {
      global.gc();
    }
    await preWarmPrivacyModel();
    console.log('Agent2 model initialized and pre-warmed successfully');

    return true;
  } catch (error) {
    console.error('Error initializing agent2 model:', error);
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
          noToolInstructions: true,
          templateFormatter: async (messages) => {
            const formattedPrompt = await formatChatPrompt(
              messages.system || '',
              messages.prompt
            );
            return formattedPrompt;
          }
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


async function runPrivacyAgent(text, attributes, analyzedPhrases, window) {
  console.log('Running privacy agent with attributes:', attributes);
  console.log('with special attention to:', analyzedPhrases);
  const startTime = process.hrtime.bigint();
  let sessionObj = null;
  let accumulatedText = '';

  try {
    sessionObj = await createPrivacySession();
    let prompt;
    if (attributes.length > 0) {
      prompt = `Modify the following text so that nobody could infer these attributes about myself ${attributes.join(', ')}, 
      and follow these two instructions:
1) Focus on changing these phrases related to the above attributes: ${analyzedPhrases.join(', ')}.\n\n
2) Give me the modified text with same length as the original text.
Original text to modify: "${text}"\n\n`;
    } else {
      // default prompt when no specific attributes are provided
      prompt = `Modify the following text so that nobody could infer any attributes about myself. 
      Follow these instructions:
1) Rephrase the text to obscure any personal identifiable information while maintaining the core message.
2) Give me the modified text with same length as the original text.
Original text to modify: "${text}"\n\n`;
    }

    let lastChunkTime = Date.now();
    const CHUNK_DELAY = 5; // reduce for smoother streaming

    await sessionObj.session.prompt(prompt, {
      onToken: async (token) => {
        const decoded = privacyModel.detokenize([token]);
        accumulatedText += decoded;

        process.stdout.write(decoded);

        const now = Date.now();
        if (now - lastChunkTime >= CHUNK_DELAY) {
          // extract summary if a think tag is present
          const thinkTagIndex = accumulatedText.lastIndexOf('</think>');

          let mainContent = accumulatedText;
          let summaryContent = '';

          if (thinkTagIndex !== -1) {
            // opnly show text up to the </think> tag in the main content
            mainContent = accumulatedText.substring(0, thinkTagIndex + 8).trim();
            summaryContent = accumulatedText.substring(thinkTagIndex + 8).trim();
          }

          // send intermediate chunks to the renderer
          window.webContents.send('privacyChunk', {
            text: mainContent, 
            summary: summaryContent, 
            isComplete: false
          });
          lastChunkTime = now;
        }
      }
    });

    const thinkTagIndex = accumulatedText.lastIndexOf('</think>');

    // split content if think tag is present
    let mainContent = accumulatedText;
    let summaryContent = '';

    if (thinkTagIndex !== -1) {
      mainContent = accumulatedText.substring(0, thinkTagIndex + 8).trim();
      summaryContent = accumulatedText.substring(thinkTagIndex + 8).trim();
    }

    window.webContents.send('privacyChunk', {
      text: mainContent,
      summary: summaryContent,
      isComplete: true
    });

    const endTime = process.hrtime.bigint();
    const inferenceTime = Number(endTime - startTime) / 1e6;

    console.log(`\n\n Privacy agent inference time: ${inferenceTime.toFixed(2)} ms`);

    return {
      response: accumulatedText,
      mainContent: mainContent,
      summary: summaryContent,
      inferenceTime
    };
  } catch (error) {
    console.error('Error running privacy agent:', error);
    window.webContents.send('privacyChunk', {
      text: `Error: ${error.message}`,
      summary: '',
      isComplete: true,
      error: true
    });
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