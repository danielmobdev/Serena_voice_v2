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

  // Connection State Management
  const currentConnectionIdRef = useRef<number>(0);
  const isConnectedRef = useRef<boolean>(false);

  const disconnect = useCallback(() => {
    // 1. Mark as disconnected immediately to stop audio loop
    isConnectedRef.current = false;
    currentConnectionIdRef.current += 1;

    // 2. Stop all audio sources
    if (sourcesRef.current) {
      sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
      });
      sourcesRef.current.clear();
    }

    // 3. Close session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
          try { session.close(); } catch(e) {}
        }, () => {}).catch(() => {});
      sessionPromiseRef.current = null;
    }

    // 4. Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch(e) {}
      });
      streamRef.current = null;
    }

    // 5. Disconnect nodes safely
    try { scriptProcessorRef.current?.disconnect(); } catch(e) {}
    scriptProcessorRef.current = null;

    // 6. Close contexts safely
    if (inputAudioContextRef.current) {
      try {
        if (inputAudioContextRef.current.state !== 'closed') {
           inputAudioContextRef.current.close().catch(() => {});
        }
      } catch (e) {}
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      try {
        if (outputAudioContextRef.current.state !== 'closed') {
           outputAudioContextRef.current.close().catch(() => {});
        }
      } catch(e) {}
      outputAudioContextRef.current = null;
    }
    
    setConnectionState(ConnectionState.DISCONNECTED);
    setVolume(0);
  }, []);

  const connect = useCallback(async () => {
    disconnect();
    
    const connectionId = currentConnectionIdRef.current + 1;
    currentConnectionIdRef.current = connectionId;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000, latencyHint: 'interactive' });
      const outputCtx = new AudioContextClass({ sampleRate: 24000, latencyHint: 'interactive' });
      
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      if (currentConnectionIdRef.current !== connectionId) {
        try { inputCtx.close(); } catch(e) {}
        try { outputCtx.close(); } catch(e) {}
        return;
      }

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const inputGain = inputCtx.createGain();
      const outputGain = outputCtx.createGain();
      inputNodeRef.current = inputGain;
      outputNodeRef.current = outputGain;
      outputGain.connect(outputCtx.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: { ideal: true },      
          noiseSuppression: { ideal: true },      
          autoGainControl: { ideal: true },       
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true 
        } as any 
      });

      if (currentConnectionIdRef.current !== connectionId) {
        stream.getTracks().forEach(t => t.stop());
        try { inputCtx.close(); } catch(e) {}
        try { outputCtx.close(); } catch(e) {}
        return;
      }

      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (currentConnectionIdRef.current !== connectionId) return;
            
            isConnectedRef.current = true;
            setConnectionState(ConnectionState.CONNECTED);
            
            const source = inputCtx.createMediaStreamSource(stream);
            // Increased buffer size to 2048 to prevent network saturation and "Network Error" crashes
            const scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              if (currentConnectionIdRef.current !== connectionId || !isConnectedRef.current) return;
              if (!inputCtx || inputCtx.state === 'closed') return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume calculation
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rawRms = Math.sqrt(sum / inputData.length);
              
              const NOISE_THRESHOLD = 0.01; 
              let dataToSend = inputData;
              
              if (rawRms < NOISE_THRESHOLD) {
                 dataToSend = new Float32Array(inputData.length); 
              }

              const effectiveRms = rawRms < NOISE_THRESHOLD ? 0 : rawRms;
              setVolume(Math.min(effectiveRms * 5, 1)); 

              const pcmBlob = createPcmBlob(dataToSend);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                  if (currentConnectionIdRef.current !== connectionId || !isConnectedRef.current) return;
                  try {
                    session.sendRealtimeInput({ media: pcmBlob });
                  } catch (e) {
                    // Ignore synchronous send errors
                  }
                }).catch(() => {});
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Send trigger message with slight delay to ensure readiness
            setTimeout(() => {
                sessionPromiseRef.current?.then(session => {
                   if (currentConnectionIdRef.current !== connectionId || !isConnectedRef.current) return;
                   try {
                     session.sendRealtimeInput({
                       content: { role: 'user', parts: [{ text: "start_conversation" }] }
                     });
                   } catch (e) {
                     // Suppress trigger errors
                   }
                }).catch(() => {});
            }, 200);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (currentConnectionIdRef.current !== connectionId || !isConnectedRef.current) return;

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'bookAppointment') {
                  const args = fc.args as unknown as AppointmentData;
                  onAppointmentBooked(args);
                  
                  sessionPromiseRef.current?.then(session => {
                    try {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: { result: "Success. Appointment saved to database." }
                        }
                      });
                    } catch (e) { console.error("Tool response failed:", e); }
                  }).catch(() => {});
                } else if (fc.name === 'endCall') {
                  sessionPromiseRef.current?.then(session => {
                    try {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: { result: "Call ended" }
                        }
                      });
                    } catch (e) { console.error("End call response failed:", e); }
                  }).catch(() => {});
                  
                  setTimeout(() => {
                    if (currentConnectionIdRef.current === connectionId) {
                      disconnect();
                    }
                  }, 4000);
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
              const ctx = outputAudioContextRef.current;
              if (ctx.state === 'closed') return;

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

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
             if (currentConnectionIdRef.current === connectionId) {
               setConnectionState(ConnectionState.DISCONNECTED);
               isConnectedRef.current = false;
             }
          },
          onerror: (err: any) => {
            if (currentConnectionIdRef.current === connectionId) {
              const errorMessage = err?.message || err?.toString() || '';
              
              // Ignore benign errors or race-condition network errors
              if (
                  errorMessage.includes("cancelled") || 
                  errorMessage.includes("closed") || 
                  errorMessage.includes("Network error") || 
                  errorMessage.includes("aborted")
              ) {
                return;
              }
              
              console.error("Session Error:", err);
              setError("Connection error. Please try again.");
              setConnectionState(ConnectionState.ERROR);
              isConnectedRef.current = false;
            }
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
      
      sessionPromise.then(() => {}, (err) => {
         if (currentConnectionIdRef.current === connectionId) {
           console.error("Connection Handshake Failed:", err);
           setConnectionState(ConnectionState.ERROR);
           setError("Unable to connect. Please check your network or API key.");
           isConnectedRef.current = false;
         }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      if (currentConnectionIdRef.current === connectionId) {
        console.error("Setup Failed:", err);
        setError("Failed to initialize connection.");
        setConnectionState(ConnectionState.ERROR);
        disconnect();
      }
    }
  }, [onAppointmentBooked, disconnect]);

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