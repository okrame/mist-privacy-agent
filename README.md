# Mist: the privacy agent

<p align="left">
    <a href="LICENSE">
        <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
    </a>
    <a href="https://huggingface.co/gufett0/unsloth-llama3B">
        <img src="https://img.shields.io/badge/model-GGUF_quantized-important?style=flat-square">
    </a>
    <img src="https://img.shields.io/badge/macOS-tested-brightgreen?style=flat-square">
    <img src="https://img.shields.io/badge/Node-%3E%3D18-informational?style=flat-square">
</p>



Mist is a desktop experiment showing how local small language models can infer personal attributes from a user prompt, and then help rewrite that same prompt to reduce such inference risks.


<video src="https://github.com/user-attachments/assets/92c572c5-7a41-4a56-b82a-d84c5ac7a34c" autoplay loop muted playsinline width="600"></video>


## Why?
Text that feels anonymous is often not. Seemingly harmless phrases can leak things like:

* approximate age
* socioeconomic status
* relationship status
* geographic information
* education or employment patterns

Mist makes these risks *visible*:

* what is being inferred
* how strongly
* why the model believes it
* how rewriting shifts inference power

So the goal is understanding the potential risk of privacy leak, and offering an alternative.

**Mist is intentionally offline**: text processing and attribute inference run locally, with no external data transmission.

## Relevant research

Mist builds on two recent efforts:

1. **SynthPAI** – the Privacy Adversarial Inference dataset
   Synthetic first-person narratives labeled with attributes such as age, education, occupation, and relationship status.
   [https://arxiv.org/pdf/2406.07217](https://arxiv.org/pdf/2406.07217)

2. **Beyond Memorization: Violating Privacy via Inference with Large Language Models**
   Staab et al., ICLR 2024
   Demonstrates that pretrained LLMs can infer demographics and sensitive traits (e.g., location, income, family status) from everyday text at high accuracy, and that standard anonymization offers limited mitigation.
   [https://arxiv.org/pdf/2310.07298](https://arxiv.org/pdf/2310.07298)


## Core Functionality

**Agent 1**

It uses a finetuned LLaMA-3B (quantized) for personal attributed inference trained over https://huggingface.co/datasets/RobinSta/SynthPAI. 

   * Structured streaming JSON predictions
   * Confidence scoring per attribute
   * Phrase-level rationale extraction

You can dowload the model from https://huggingface.co/gufett0/unsloth-llama3B

**Agent 2**

It can use any model, currently [this](https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/blob/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_S.gguf) 8B distillation model

   * Rewrites text to weaken or remove evidence supporting attribute inference
   * Preserves meaning, tone, and approximate length
   * Focused revisions guided by leakage explanations


## Quickstart

Get dependencies with `npm install`

Download the required model files and place them in: `/src/models/`

Run the electron app in development mode: `npm start`

The app will pop up in the menu bar, and it will first initialize the models. 

### Using Mist:

1. Insert prompt
2. Run **Analyze**

   * Attributes + strengths + rationales stream live.
3. Run **Mist**

   * Output is a privacy-preserving rewrite with preserved narrative style.

Runs best on machines with sufficient RAM for GGUF quantization.

### Requirements:

- macOS (Apple Silicon or Intel) — tested
- Linux x86_64 — expected to work (Electron + node-llama-cpp, .deb/.rpm targets are configured)
- Windows 10/11 x86_64 — packaging via Squirrel is configured but not tested yet

Hardware:
- Node.js >= 18
- CPU with AVX2 support
- ~8 GB RAM free to run both models
- ~10 GB disk for model files in `./src/models/`

---
