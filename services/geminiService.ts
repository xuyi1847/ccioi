
import { GoogleGenAI, Modality, Type, GenerateContentResponse } from "@google/genai";
import { decodeBase64 } from "./audioUtils";

// --- Types ---
export interface VideoGenerationState {
  isGenerating: boolean;
  progressMessage: string;
  videoUri: string | null;
  error: string | null;
}

export interface AdvancedVideoOptions {
  configFile: string;
  condType?: string;
  numSteps?: number;
  numFrames?: number;
  aspectRatio?: string;
  fps?: number;
  refImage?: string; // base64
}

// --- Initialization ---
const createAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- Chat ---
export const streamChat = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  onChunk: (text: string) => void
) => {
  const ai = createAIClient();
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    history: history,
  });

  const result = await chat.sendMessageStream({ message });
  
  for await (const chunk of result) {
    const c = chunk as GenerateContentResponse;
    if (c.text) {
      onChunk(c.text);
    }
  }
};

// --- Image Generation ---
export const generateImage = async (prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  const ai = createAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image data returned");
};

// --- Video Generation (CCIOI / Veo) ---
export const generateVideo = async (
  prompt: string, 
  options: AdvancedVideoOptions,
  onProgress: (msg: string) => void
): Promise<string> => {
  if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
    await window.aistudio.openSelectKey();
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  onProgress("Initializing generation with config: " + options.configFile + "...");

  // Mapping aspect ratio to supported API values
  let apiAspectRatio: '16:9' | '9:16' = '16:9';
  if (options.aspectRatio === '9:16') apiAspectRatio = '9:16';

  // Mapping resolution based on config file names
  let apiResolution: '720p' | '1080p' = '720p';
  if (options.configFile.includes('768px')) apiResolution = '1080p';

  const videoConfig: any = {
    numberOfVideos: 1,
    resolution: apiResolution,
    aspectRatio: apiAspectRatio
  };

  // Construct enhanced prompt based on technical parameters if needed
  const enhancedPrompt = `${prompt} [Config: ${options.configFile}, Cond: ${options.condType || 'None'}, Steps: ${options.numSteps || 40}, Frames: ${options.numFrames || 112}, FPS: ${options.fps || 16}]`;

  let operation;
  if (options.refImage) {
    // Reference image generation (i2v)
    const base64Data = options.refImage.replace(/^data:image\/\w+;base64,/, "");
    operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: enhancedPrompt,
      image: {
        imageBytes: base64Data,
        mimeType: 'image/png'
      },
      config: videoConfig
    });
  } else {
    // Text to video generation
    operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: enhancedPrompt,
      config: videoConfig
    });
  }

  onProgress("Rendering high-fidelity sequence...");
  
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed to return a valid CCIOI stream.");

  return `${videoUri}&key=${process.env.API_KEY}`;
};

// --- Text To Speech ---
export const generateSpeech = async (text: string, voiceName: string): Promise<Uint8Array> => {
  const ai = createAIClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio data returned");
  
  return decodeBase64(base64Audio);
};

// --- Text Analysis ---
export const analyzeText = async (text: string, type: 'SUMMARY' | 'SENTIMENT' | 'KEYWORDS'): Promise<string> => {
  const ai = createAIClient();
  
  let prompt = "";
  switch (type) {
    case 'SUMMARY':
      prompt = `Summarize the following text concisely:\n\n${text}`;
      break;
    case 'SENTIMENT':
      prompt = `Analyze the sentiment of the following text. Provide a classification (Positive, Negative, Neutral) and a brief explanation:\n\n${text}`;
      break;
    case 'KEYWORDS':
      prompt = `Extract the top 5-10 key topics or entities from the following text:\n\n${text}`;
      break;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });

  return response.text || "No analysis generated.";
};
