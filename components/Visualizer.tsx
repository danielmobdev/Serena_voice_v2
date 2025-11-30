import React from 'react';
import { ConnectionState } from '../types';

interface VisualizerProps {
  volume: number;
  state: ConnectionState;
}

const Visualizer: React.FC<VisualizerProps> = ({ volume, state }) => {
  const isConnected = state === ConnectionState.CONNECTED;
  
  // Base size
  const baseScale = 1;
  // Dynamic scale based on volume (0 to 1)
  const scale = baseScale + (volume * 1.5);

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Pulse Ring - Only when connected */}
      {isConnected && (
        <div className="absolute inset-0 rounded-full border-4 border-teal-200 opacity-20 animate-ping" />
      )}
      
      {/* Middle Dynamic Ring */}
      <div 
        className={`absolute w-48 h-48 rounded-full bg-teal-100 transition-all duration-75 ease-out ${isConnected ? 'opacity-50' : 'opacity-0'}`}
        style={{ transform: `scale(${scale})` }}
      />

      {/* Core Orb */}
      <div className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-colors duration-500
        ${state === ConnectionState.ERROR ? 'bg-red-500' : 
          state === ConnectionState.CONNECTED ? 'bg-gradient-to-br from-teal-400 to-cyan-500' : 
          state === ConnectionState.CONNECTING ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'}
      `}>
         {state === ConnectionState.CONNECTED ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
         ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
         )}
      </div>
      
      {/* Status Text overlay */}
      <div className="absolute -bottom-12 text-center w-full">
        <p className={`text-sm font-semibold tracking-wider uppercase
          ${state === ConnectionState.ERROR ? 'text-red-600' : 'text-slate-500'}`}>
          {state === ConnectionState.CONNECTED ? (volume > 0.05 ? "Listening..." : "Active") : 
           state === ConnectionState.CONNECTING ? "Connecting..." : 
           state === ConnectionState.DISCONNECTED ? "Ready to Connect" : "Error"}
        </p>
      </div>
    </div>
  );
};

export default Visualizer;