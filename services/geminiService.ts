import { GoogleGenAI, Modality, Type } from "@google/genai";
import { decodeBase64 } from "./audioUtils";

// --- Types ---
export interface VideoGenerationState {
  isGenerating: boolean;
  progressMessage: string;
  videoUri: string | null;
  error: string | null;
}

// --- Initialization ---
// We create a factory function because for Veo, we might need to re-instantiate with a new key.
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
    model: 'gemini-2.5-flash',
    history: history,
  });

  const result = await chat.sendMessageStream({ message });
  
  for await (const chunk of result) {
    if (chunk.text) {
      onChunk(chunk.text);
    }
  }
};

// --- Image Generation ---
export const generateImage = async (prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  const ai = createAIClient();
  // Using flash-image for speed and efficiency as per prompt guidelines for general use
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

// --- Video Generation (Veo) ---
export const generateVideo = async (
  prompt: string, 
  onProgress: (msg: string) => void
): Promise<string> => {
  // 1. Check/Request Paid Key
  if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
    await window.aistudio.openSelectKey();
    // Proceed without checking return value, as per guidelines to assume success and mitigate race condition.
  }

  // 2. Re-init client to ensure key is active
  const ai = createAIClient();

  onProgress("Initializing video generation...");
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview', // Fast preview for better UX
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  onProgress("Rendering video (this may take a minute)...");
  
  // 3. Polling
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed to return a URI.");

  // 4. Return authenticated URL
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
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || "No analysis generated.";
};