import { GoogleGenAI } from "https://esm.run/@google/genai";
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- Helper Types ---
type Character = {
  id: string;
  name: string;
  description: string;
};

type StoryboardScene = {
  id: string;
  sceneNumber: number;
  sceneDescription: string;
  videoPrompt: string;
  imageUrl: string | null;
  imageStatus: 'idle' | 'loading' | 'done' | 'error';
  videoStatus: 'idle' | 'loading' | 'done' | 'error';
  videoUrl: string | null;
  videoOperation: any | null;
  errorMessage?: string;
};

// --- Initial Data ---
const initialScenes: StoryboardScene[] = [
  {
    id: `scene-${Date.now()}-1`,
    sceneNumber: 1,
    sceneDescription: "A young woman, ZARA, stands on a neon-lit rooftop overlooking a futuristic city at night. Rain is falling. She looks determined.",
    videoPrompt: "Cinematic shot, rain falling slowly, subtle steam rising from the city streets below.",
    imageUrl: null,
    imageStatus: 'idle',
    videoStatus: 'idle',
    videoUrl: null,
    videoOperation: null,
  },
  {
    id: `scene-${Date.now()}-2`,
    sceneNumber: 2,
    sceneDescription: "CLOSE UP on ZARA's face. A single tear mixes with the rain on her cheek.",
    videoPrompt: "Slow zoom-in on her face, focus on the tear, melancholic mood.",
    imageUrl: null,
    imageStatus: 'idle',
    videoStatus: 'idle',
    videoUrl: null,
    videoOperation: null,
  },
  {
      id: `scene-${Date.now()}-3`,
      sceneNumber: 3,
      sceneDescription: "A man, ALEX, emerges from the shadows behind her. He's holding a strange, glowing device. ZARA turns around, startled.",
      videoPrompt: "A quick pan as Zara turns around, the device glows brightly, creating lens flare.",
      imageUrl: null,
      imageStatus: 'idle',
      videoStatus: 'idle',
      videoUrl: null,
      videoOperation: null,
  }
];


const initialCharacters: Character[] = [
  { id: 'char1', name: 'ZARA', description: 'A young woman in her early 20s with short, punk-rock pink hair, wearing a worn-out black leather jacket, and has a cybernetic implant above her right eye. She has a fierce and determined expression.' },
  { id: 'char2', name: 'ALEX', description: 'A tall, mysterious man in his late 30s with a rugged beard, a long dark trench coat, and piercing blue eyes. He looks calm and calculating.' },
];

// --- Helper Functions ---
const parseApiError = (error: any): { message: string; isQuotaError: boolean } => {
    let errorMessage = "An unknown error occurred.";
    let isQuotaError = false;

    if (error?.message) {
        try {
            // Gemini API errors are often JSON strings in the message property
            const parsedError = JSON.parse(error.message);
            if (parsedError?.error?.message) {
                errorMessage = `Failed: ${parsedError.error.message}`;
                if (parsedError.error.status === 'RESOURCE_EXHAUSTED') {
                    isQuotaError = true;
                }
            } else {
                 errorMessage = error.message;
            }
        } catch (e) {
            // If it's not a JSON string, use the message directly
            errorMessage = error.message;
        }
    } else if (typeof error === 'string') {
        errorMessage = error;
    }
    
    return { message: errorMessage, isQuotaError };
};


// --- UI Components ---
const Spinner = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

const App = () => {
    // --- State ---
    const [scenes, setScenes] = useState<StoryboardScene[]>(initialScenes);
    const [characters, setCharacters] = useState<Character[]>(initialCharacters);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [globalError, setGlobalError] = useState<string>('');
    const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);
    
    // --- Memoized AI Client ---
    const ai = useMemo(() => {
        try {
            return new GoogleGenAI({ apiKey: process.env.API_KEY });
        } catch (e) {
            setGlobalError("API Key is missing or invalid. Please ensure it's configured correctly in your environment.");
            console.error(e);
            return null;
        }
    }, []);

    // --- Scene Management ---
    const addScene = () => {
      const newSceneNumber = scenes.length > 0 ? Math.max(...scenes.map(s => s.sceneNumber)) + 1 : 1;
      const newScene: StoryboardScene = {
        id: `scene-${Date.now()}`,
        sceneNumber: newSceneNumber,
        sceneDescription: "",
        videoPrompt: "",
        imageUrl: null,
        imageStatus: 'idle',
        videoStatus: 'idle',
        videoUrl: null,
        videoOperation: null,
      };
      setScenes([...scenes, newScene]);
    };
    
    const updateScene = (id: string, field: 'sceneDescription' | 'videoPrompt', value: string) => {
      setScenes(scenes.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const removeScene = (id: string) => {
      setScenes(scenes.filter(s => s.id !== id).map((s, index) => ({...s, sceneNumber: index + 1})));
    };

    // --- Character Management ---
    const addCharacter = () => {
        const newId = `char${Date.now()}`;
        setCharacters([...characters, { id: newId, name: 'NEW CHARACTER', description: '' }]);
    };

    const updateCharacter = (id: string, field: 'name' | 'description', value: string) => {
        setCharacters(characters.map(c => c.id === id ? { ...c, [field]: value } : c));
    };
    
    const removeCharacter = (id: string) => {
        setCharacters(characters.filter(c => c.id !== id));
    };

    // --- Core AI Logic ---
    const generateImageForScene = useCallback(async (sceneId: string) => {
        if (!ai || isQuotaExceeded) {
            if (!ai) setGlobalError("AI client is not initialized.");
            return;
        }
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene || !scene.sceneDescription) return;

        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageStatus: 'loading' } : s));

        const characterContext = "For character consistency, adhere to these descriptions: " +
            characters.map(c => `[${c.name.toUpperCase()}: ${c.description}]`).join('; ');

        try {
            const prompt = `${characterContext}. Create a cinematic, atmospheric storyboard frame for the following scene: ${scene.sceneDescription}`;
            
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1, aspectRatio: '16:9' }
            });
            
            const imageUrl = `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
            
            setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, imageStatus: 'done' } : s));
        } catch (error) {
            console.error(`Error generating image for scene ${scene.sceneNumber}:`, error);
            const { message, isQuotaError } = parseApiError(error);
            if (isQuotaError) setIsQuotaExceeded(true);
            setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageStatus: 'error', errorMessage: message } : s));
        }
    }, [ai, scenes, characters, isQuotaExceeded]);

    const generateAllImages = useCallback(async () => {
        if (isQuotaExceeded) return;
        setIsGenerating(true);
        for (const scene of scenes) {
            if (scene.sceneDescription && (scene.imageStatus === 'idle' || scene.imageStatus === 'error')) {
                await generateImageForScene(scene.id);
            }
        }
        setIsGenerating(false);
    }, [scenes, generateImageForScene, isQuotaExceeded]);

    const animateScene = useCallback(async (sceneId: string) => {
        if (!ai || isQuotaExceeded) {
             if (!ai) setGlobalError("AI client is not initialized.");
            return;
        }
        
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene || !scene.imageUrl) return;

        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'loading' } : s));
        
        try {
            const base64ImageData = scene.imageUrl.split(',')[1];
            const prompt = scene.videoPrompt || `Animate this scene with a subtle, cinematic feel: ${scene.sceneDescription}`;
            
            const operation = await ai.models.generateVideos({
                model: 'veo-2.0-generate-001',
                prompt: prompt,
                image: {
                    imageBytes: base64ImageData,
                    mimeType: 'image/png'
                },
                config: { numberOfVideos: 1 }
            });

            setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'loading', videoOperation: operation } : s));

        } catch (error) {
            console.error(`Error animating scene ${scene.sceneNumber}:`, error);
            const { message, isQuotaError } = parseApiError(error);
            if (isQuotaError) setIsQuotaExceeded(true);
            setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'error', errorMessage: message } : s));
        }
    }, [ai, scenes, isQuotaExceeded]);

    const pollVideoStatus = useCallback(async (sceneId: string, operationToPoll: any) => {
        if (!ai || isQuotaExceeded) return;

        try {
            const operation = await ai.operations.getVideosOperation({ operation: operationToPoll });
            
            if (operation.done) {
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (downloadLink && process.env.API_KEY) {
                    const videoUrlWithKey = `${downloadLink}&key=${process.env.API_KEY}`;
                    const response = await fetch(videoUrlWithKey);
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'done', videoUrl: objectUrl, videoOperation: null } : s));
                } else {
                     throw new Error("Video generation finished but no URL was returned or API key is missing.");
                }
            }
        } catch (error) {
            console.error(`Error polling video status for scene ${sceneId}:`, error);
            const { message, isQuotaError } = parseApiError(error);
            if (isQuotaError) setIsQuotaExceeded(true);
            setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'error', errorMessage: message, videoOperation: null } : s));
        }
    }, [ai, isQuotaExceeded]);

    // Effect to stop in-progress animations when quota is exceeded
    useEffect(() => {
        if (isQuotaExceeded) {
            setScenes(prevScenes =>
                prevScenes.map(s =>
                    s.videoStatus === 'loading'
                        ? {
                              ...s,
                              videoStatus: 'error',
                              errorMessage: 'Animation stopped: API quota exceeded.',
                              videoOperation: null,
                          }
                        : s
                )
            );
        }
    }, [isQuotaExceeded]);

    // Effect for polling video status
    useEffect(() => {
        const scenesToPoll = scenes.filter(
            s => s.videoStatus === 'loading' && s.videoOperation
        );

        if (scenesToPoll.length === 0) return;

        const interval = setInterval(() => {
            scenesToPoll.forEach(scene => {
                pollVideoStatus(scene.id, scene.videoOperation!);
            });
        }, 10000); // Poll every 10 seconds

        return () => clearInterval(interval);
    }, [scenes, pollVideoStatus]);

    // --- Render ---
    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            {isQuotaExceeded && (
                <div className="bg-red-900 border-b border-red-700 text-red-200 px-4 py-3 text-center fixed top-0 left-0 right-0 z-50" role="alert">
                    <p className="font-bold">API Quota Exceeded</p>
                    <p className="text-sm">You have reached your API usage limit. Further generation requests will fail.</p>
                </div>
            )}
            <div className={`flex flex-col lg:flex-row ${isQuotaExceeded ? 'pt-[68px]' : ''}`}>
                {/* --- Left Column: Controls --- */}
                <aside className="w-full lg:w-1/3 xl:w-1/4 bg-gray-800 p-4 h-screen overflow-y-auto shadow-lg">
                    <header className="mb-6">
                        <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">AI Storyboard</h1>
                        <p className="text-gray-400 mt-1 text-sm">Craft your story, scene by scene.</p>
                    </header>
                    {globalError && <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-md mb-4" role="alert">{globalError}</div>}
                    
                    <div className="space-y-6">
                        {/* Scenes Section */}
                        <div>
                            <h2 className="text-xl font-semibold mb-3 border-b border-gray-700 pb-2">1. Scenes</h2>
                            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                                {scenes.map((scene, index) => (
                                    <div key={scene.id} className="bg-gray-700/50 p-3 rounded-md">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-bold text-white">SCENE {scene.sceneNumber}</h3>
                                            <button onClick={() => removeScene(scene.id)} className="text-gray-400 hover:text-red-500 transition-colors text-xs font-semibold" aria-label={`Remove scene ${scene.sceneNumber}`}>REMOVE</button>
                                        </div>
                                        <textarea
                                            value={scene.sceneDescription}
                                            onChange={(e) => updateScene(scene.id, 'sceneDescription', e.target.value)}
                                            className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                            placeholder={`Scene ${scene.sceneNumber} description...`}
                                            aria-label={`Scene ${scene.sceneNumber} description`}
                                        />
                                        <input
                                          type="text"
                                          value={scene.videoPrompt}
                                          onChange={(e) => updateScene(scene.id, 'videoPrompt', e.target.value)}
                                          className="w-full mt-2 bg-gray-900/50 border border-gray-600 rounded-md p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                          placeholder="Animation prompt (e.g., slow zoom in)"
                                          aria-label={`Scene ${scene.sceneNumber} animation prompt`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button onClick={addScene} className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm">+ Add Scene</button>
                        </div>
                        
                        {/* Characters Section */}
                        <div>
                            <h2 className="text-xl font-semibold mb-3 border-b border-gray-700 pb-2">2. Characters</h2>
                             {characters.map((char) => (
                                 <div key={char.id} className="bg-gray-700/50 p-3 rounded-md mb-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <input
                                            type="text"
                                            value={char.name}
                                            onChange={(e) => updateCharacter(char.id, 'name', e.target.value.toUpperCase())}
                                            className="bg-transparent font-bold text-white w-full mr-2"
                                            aria-label={`Character name for ${char.name}`}
                                        />
                                        <button onClick={() => removeCharacter(char.id)} className="text-gray-400 hover:text-red-500 transition-colors text-xs font-semibold" aria-label={`Remove character ${char.name}`}>REMOVE</button>
                                    </div>
                                    <textarea
                                        value={char.description}
                                        onChange={(e) => updateCharacter(char.id, 'description', e.target.value)}
                                        className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-md p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                        placeholder={`Describe ${char.name}'s appearance...`}
                                        aria-label={`Character description for ${char.name}`}
                                    />
                                 </div>
                             ))}
                             <button onClick={addCharacter} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm">+ Add Character</button>
                        </div>

                        {/* Generate Button */}
                        <div>
                            <button 
                                onClick={generateAllImages}
                                disabled={isGenerating || isQuotaExceeded}
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2 text-lg"
                            >
                                {isGenerating ? <><Spinner /> Generating...</> : "3. Generate All Images"}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* --- Right Column: Storyboard --- */}
                <main className="w-full lg:w-2/3 xl:w-3/4 p-4 lg:p-6 h-screen overflow-y-auto">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2 text-white">Storyboard</h2>
                    {scenes.length === 0 && !isGenerating && (
                        <div className="text-center py-24 text-gray-500">
                            <p>Your storyboard is empty.</p>
                            <p className="text-sm">Add a scene on the left to get started.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {scenes.map((scene) => (
                            <div key={scene.id} className="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col">
                                <div className="aspect-video bg-gray-700 rounded-md flex items-center justify-center overflow-hidden mb-3">
                                    {scene.videoStatus === 'done' && scene.videoUrl && <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />}
                                    {scene.imageStatus === 'done' && scene.videoStatus !== 'done' && scene.imageUrl && <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />}
                                    {scene.imageStatus === 'loading' && <div className="flex flex-col items-center gap-2 text-sm"><Spinner /><span>Generating Image...</span></div>}
                                    {scene.videoStatus === 'loading' && <div className="flex flex-col items-center gap-2 text-sm p-2 text-center"><Spinner /><span>Animating...<br/>This can take a few minutes.</span></div>}
                                    {(scene.imageStatus === 'error' || scene.videoStatus === 'error') && <p className="text-red-400 text-xs p-2 text-center">{scene.errorMessage}</p>}
                                </div>
                                <div className="flex-grow">
                                    <h3 className="font-bold text-gray-300 mb-1">SCENE {scene.sceneNumber}</h3>
                                    <p className="text-sm text-gray-400 mb-3 text-ellipsis overflow-hidden h-15">{scene.sceneDescription}</p>
                                </div>
                                <div className="mt-auto pt-3 border-t border-gray-700">
                                    {scene.imageStatus !== 'loading' && scene.videoStatus !== 'loading' &&
                                      <div className="flex items-center justify-between">
                                        <button onClick={() => generateImageForScene(scene.id)} disabled={!scene.sceneDescription || isQuotaExceeded} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                            {scene.imageUrl ? 'Regenerate Image' : 'Generate Image'}
                                        </button>
                                        {scene.imageStatus === 'done' && (
                                            <button onClick={() => animateScene(scene.id)} disabled={isQuotaExceeded} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors">Animate</button>
                                        )}
                                      </div>
                                    }
                                    {scene.videoStatus === 'done' && <p className="text-xs text-green-400 text-center font-semibold">Animation Complete!</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);