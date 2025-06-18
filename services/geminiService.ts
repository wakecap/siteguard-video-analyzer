
import { GoogleGenAI, GenerateContentResponse, createUserContent, createPartFromUri, File as GeminiFile } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY") {
  console.warn(
    "API_KEY for Gemini is not set or is a placeholder. Gemini functionality will not work. Please ensure process.env.API_KEY is configured in index.html."
  );
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });
const videoModelName = 'gemini-2.5-pro-preview-05-06'; // No longer needed if analyzeImageForHazards is removed
// const videoModelName = 'gemini-2.5-flash-preview-04-17'; // Updated as per user request

const POLLING_INTERVAL_MS = 5000;
const MAX_POLLING_ATTEMPTS = 36; 

export const uploadVideoFile = async (
  file: File,
  displayName?: string
): Promise<{ uri: string; mimeType: string; name: string; videoId: string }> => {
  if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY") {
    throw new Error("API_KEY for Gemini is not configured. File upload cannot be performed.");
  }
  try {
    const mimeType = file.type || 'video/mp4';
    
    const initialUploadResponse: GeminiFile = await ai.files.upload({
      file: file,
      config: {
        mimeType: mimeType,
        displayName: displayName || file.name,
      },
    });

    if (!initialUploadResponse.name) {
        throw new Error("File name (resource ID) not found in initial upload response.");
    }
    const videoId = initialUploadResponse.name;

    let attempts = 0;
    while (attempts < MAX_POLLING_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
      attempts++;
      
      const currentFileStatus = await ai.files.get({ name: videoId });

      if (currentFileStatus.state === 'ACTIVE') {
        if (!currentFileStatus.uri) {
            throw new Error("File is ACTIVE but URI is missing.");
        }
        return {
          uri: currentFileStatus.uri,
          mimeType: currentFileStatus.mimeType || mimeType,
          name: currentFileStatus.displayName || file.name,
          videoId: videoId
        };
      } else if (currentFileStatus.state === 'FAILED') {
        let detailedErrorString = 'No specific error details were provided by Gemini.';
        if (currentFileStatus.error) {
            // Log the raw object for interactive console inspection
            console.error("Original Gemini file processing error object:", currentFileStatus.error);
            try {
                // Stringify the full error object to capture all its properties
                detailedErrorString = JSON.stringify(currentFileStatus.error, null, 2);
                console.error("Stringified Gemini file processing error details:", detailedErrorString);
            } catch (e) {
                // Fallback if stringify fails (unlikely for plain objects from APIs)
                let errorMessage = currentFileStatus.error.toString();
                if (typeof currentFileStatus.error === 'object' && currentFileStatus.error !== null && 'message' in currentFileStatus.error) {
                    errorMessage = (currentFileStatus.error as {message: string}).message || errorMessage;
                }
                detailedErrorString = `Could not stringify error object. Raw error: ${errorMessage}`;
                console.error(detailedErrorString);
            }
        }
        // Throw an error that includes the full stringified details (or best effort)
        throw new Error(`File processing failed. State: ${currentFileStatus.state}. Gemini Error: ${detailedErrorString}`);
      }
    }

    throw new Error(`File did not become ACTIVE after ${MAX_POLLING_ATTEMPTS} attempts. Last state: PROCESSING.`);

  } catch (error) {
    console.error('Error during video file upload or processing:', error);
    if (error instanceof Error) {
        // If the error is already a detailed one from our code (e.g., the throw above)
        // or a network error, propagate its message.
        throw new Error(`Error uploading/processing video: ${error.message}`);
    }
    throw new Error('An unknown error occurred while uploading or processing the video.');
  }
};

export const analyzeUploadedVideo = async (
  fileUri: string,
  fileMimeType: string,
  jsaOrHazardContext: string,
  userInstructionPrompt: string
): Promise<string> => { 
  if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY") {
    return JSON.stringify({ error: "API_KEY for Gemini is not configured. Video analysis cannot be performed." });
  }

  const videoPart = createPartFromUri(fileUri, fileMimeType);
  
  const systemPrompt = `You are SiteGuard AI, an expert construction safety analysis system.
You will be given a video, a Job Safety Analysis (JSA) or hazard context, and specific user instructions.
Analyze the video based on ALL provided information.

Your response MUST be a VALID JSON object with the following structure:
{
  "summary": "A concise overall summary of the video content and safety observations.",
  "safetyScore": <number between 0 and 100, representing overall safety compliance>,
  "violations": [
    {
      "description": "Detailed description of the safety violation or concern.",
      "startTimeSeconds": <number, e.g., 32.5, representing the start time of the event in SECONDS from the video's absolute beginning (0 seconds)>,
      "endTimeSeconds": <number, e.g., 35.0, representing the end time of the event in SECONDS from the video's absolute beginning (0 seconds)>,
      "durationSeconds": <number, e.g., 2.5, representing the duration of the event in seconds>,
      "severity": "<'Critical' | 'High' | 'Medium' | 'Low' | 'Info'>",
      "onScreenStartTime": "<string, e.g., '07:48:15', the timestamp string visible on the video frame at the start of the event. Omit or null if not clearly visible or decipherable.>",
      "onScreenEndTime": "<string, e.g., '07:48:18', the timestamp string visible on the video frame at the end of the event. Omit or null if not clearly visible or decipherable.>"
    }
  ],
  "positiveObservations": ["An array of strings describing any positive safety practices observed, if any."]
}

Key Instructions:
1.  **Timing:** For each violation, you MUST provide \`startTimeSeconds\` and \`endTimeSeconds\` as numbers. These times MUST be relative to the absolute beginning of the video file (i.e., the very first frame of the video corresponds to 0 seconds).
2.  **On-Screen Timestamps:** ADDITIONALLY, if an on-screen timestamp (e.g., HH:MM:SS format, often in a corner of the video) is clearly visible and decipherable within the video frames corresponding to the start and end of a violation, you MUST extract these exact timestamp strings. Provide them as \`onScreenStartTime\` and \`onScreenEndTime\` respectively. If no such on-screen timestamp is clearly visible or legible for an event's start or end, or if it's ambiguous, you should omit these \`onScreenStartTime\` and \`onScreenEndTime\` fields entirely for that violation, or set their values to null. Do not guess or infer on-screen timestamps if they are not clearly present and readable on the frame.
3.  Focus on identifying specific, actionable safety violations or concerns.
4.  Relate findings to the JSA/hazard context if provided.
5.  If no violations are found, the "violations" array should be empty.
6.  If no positive observations, "positiveObservations" array should be empty.
7.  Do not include any explanations or text outside of the single, valid JSON object.
`;

  const fullPrompt = `JSA/Hazard Context:
${jsaOrHazardContext || "No specific JSA or hazard context provided. Focus on general construction safety."}

User Instructions:
${userInstructionPrompt || "Perform a general safety analysis."}
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: videoModelName, 
      contents: {
        parts: [
            videoPart,
            {text: fullPrompt}
        ],
        role: "user" 
      },
      config: { 
        systemInstruction: systemPrompt,
        responseMimeType: "application/json", 
      }
    });
    
    let jsonStr = response.text.trim();
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }

    try {
        JSON.parse(jsonStr); 
        return jsonStr;
    } catch (e) {
        console.warn("Gemini response was not valid JSON, returning raw text. Error:", e);
        console.warn("Problematic Gemini response text:", response.text);
        return JSON.stringify({ 
            error: "Gemini response was not valid JSON.", 
            rawResponse: response.text,
            summary: "Failed to parse analysis.",
            safetyScore: 0,
            violations: [],
            positiveObservations: []
        });
    }

  } catch (error) {
    console.error('Error calling Gemini API for video analysis:', error);
    let errorMessage = 'An unknown error occurred while analyzing the video with Gemini.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return JSON.stringify({ 
        error: `Error analyzing video with Gemini: ${errorMessage}`,
        summary: "Failed to analyze video.",
        safetyScore: 0,
        violations: [],
        positiveObservations: []
    });
  }
};
