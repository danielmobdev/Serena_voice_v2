import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, AppointmentData } from '../types';
import { SYSTEM_INSTRUCTION, BOOK_APPOINTMENT_TOOL, END_CALL_TOOL } from '../constants';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audio';

interface UseGeminiLiveProps {
  onAppointmentBooked: (data: AppointmentData) => void;
}

export const useGeminiLive = ({ onAppointmentBooked }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Audio Contexts & Nodes
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<GainNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  
  // Playback cursor
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const disconnect = useCallback(() => {
    // Stop all audio sources
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();

    // Close session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        try { session.close(); } catch(e) {}
      });
      sessionPromiseRef.current = null;
    }

    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close contexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();

    // Disconnect nodes
    scriptProcessorRef.current?.disconnect();
    
    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      // 1. Initialize API
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // 2. Setup Audio Contexts with low latency config
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ 
        sampleRate: 16000,
        latencyHint: 'interactive' 
      });
      const outputCtx = new AudioContextClass({ 
        sampleRate: 24000,
        latencyHint: 'interactive' 
      });
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const inputGain = inputCtx.createGain();
      const outputGain = outputCtx.createGain();
      inputNodeRef.current = inputGain;
      outputNodeRef.current = outputGain;

      outputGain.connect(outputCtx.destination);

      // 3. Get Microphone with aggressive noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: { ideal: true },      
          noiseSuppression: { ideal: true },      
          autoGainControl: { ideal: true },       
          // Chrome specific constraints for extra cleaning
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true 
        } as any 
      });
      streamRef.current = stream;

      // 4. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Setup Input Stream Processing
            const source = inputCtx.createMediaStreamSource(stream);
            
            // Use 512 buffer for ultra-low latency (~32ms)
            // This makes the conversation feel much faster
            const scriptProcessor = inputCtx.createScriptProcessor(512, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // 1. Calculate raw RMS (Volume)
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rawRms = Math.sqrt(sum / inputData.length);
              
              // 2. NOISE GATE IMPLEMENTATION
              // Threshold 0.01 filters out breathing/background hum but keeps speech.
              // If volume is below threshold, we send SILENCE. 
              // This prevents the AI from being interrupted by background noise.
              const NOISE_THRESHOLD = 0.01; 
              let dataToSend = inputData;
              
              if (rawRms < NOISE_THRESHOLD) {
                 dataToSend = new Float32Array(inputData.length); // Send zeros
              }

              // Update visualizer only if we are actually sending data
              const effectiveRms = rawRms < NOISE_THRESHOLD ? 0 : rawRms;
              setVolume(Math.min(effectiveRms * 5, 1)); 

              const pcmBlob = createPcmBlob(dataToSend);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Send initial prompt to trigger greeting IMMEDIATELY
            sessionPromiseRef.current?.then(session => {
               session.sendRealtimeInput({
                 content: { role: 'user', parts: [{ text: "The user has joined. Start the conversation immediately with your standard greeting." }] }
               });
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Tool Calls
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'bookAppointment') {
                  const args = fc.args as unknown as AppointmentData;
                  onAppointmentBooked(args);
                  
                  // Send success response back to model
                  sessionPromiseRef.current?.then(session => {
                    session.sendToolResponse({
                      functionResponses: {
                        id: fc.id,
                        name: fc.name,
                        response: { result: "Success. Appointment saved to database." }
                      }
                    });
                  });
                } else if (fc.name === 'endCall') {
                  // Send simple response then disconnect after audio plays
                  sessionPromiseRef.current?.then(session => {
                    session.sendToolResponse({
                      functionResponses: {
                        id: fc.id,
                        name: fc.name,
                        response: { result: "Call ended" }
                      }
                    });
                  });
                  
                  // Wait for the "Goodbye" audio to finish playing (approx 4s) then disconnect
                  setTimeout(() => {
                    disconnect();
                  }, 4000);
                }
              }
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBytes = base64ToUint8Array(base64Audio);
              const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
             setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            console.error(err);
            setError("Connection error. Please try again.");
            setConnectionState(ConnectionState.ERROR);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [BOOK_APPOINTMENT_TOOL, END_CALL_TOOL] }]
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect");
      setConnectionState(ConnectionState.ERROR);
    }
  }, [onAppointmentBooked, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    volume,
    error
  };
};