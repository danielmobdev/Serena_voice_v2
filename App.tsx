import React, { useState } from 'react';
import Visualizer from './components/Visualizer';
import AppointmentDetails from './components/AppointmentDetails';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState, AppointmentData } from './types';

function App() {
  const [lastAppointment, setLastAppointment] = useState<AppointmentData | null>(null);

  const handleBooked = (data: AppointmentData) => {
    setLastAppointment(data);
    // In a real app, this is where you might trigger a toast notification or sidebar update
    console.log("Booking Confirmed:", data);
  };

  const { connectionState, connect, disconnect, volume, error } = useGeminiLive({
    onAppointmentBooked: handleBooked
  });

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-teal-600 p-2 rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
             </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Serenity Clinic</h1>
            <p className="text-xs text-slate-500">Dr. Suvendu Narayana Mishra • AI Receptionist</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`}></span>
           <span className="text-sm font-medium text-slate-600 uppercase tracking-wide">
             {connectionState === ConnectionState.CONNECTED ? 'Live' : 'Offline'}
           </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: AI Interface */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
           
           {/* Visualizer Area */}
           <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white relative p-12">
              <Visualizer volume={volume} state={connectionState} />
              
              {/* Controls */}
              <div className="mt-12 z-20">
                {!isConnected ? (
                  <button
                    onClick={connect}
                    disabled={isConnecting}
                    className={`group relative inline-flex items-center justify-center px-8 py-3 text-lg font-medium text-white transition-all duration-200 bg-teal-600 rounded-full hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 shadow-lg hover:shadow-xl ${isConnecting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isConnecting ? (
                       <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                    {isConnecting ? 'Connecting...' : 'Start Conversation'}
                  </button>
                ) : (
                  <button
                    onClick={disconnect}
                    className="inline-flex items-center justify-center px-8 py-3 text-lg font-medium text-white transition-all duration-200 bg-red-500 rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-lg hover:shadow-xl"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    End Call
                  </button>
                )}
              </div>
              
              {/* Error Message */}
              {error && (
                <div className="absolute top-4 left-0 right-0 mx-auto w-max bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100 text-sm">
                  {error}
                </div>
              )}
           </div>

           {/* Disclaimer Footer */}
           <div className="bg-slate-50 border-t border-slate-100 p-4 text-center">
             <p className="text-xs text-slate-400 max-w-2xl mx-auto leading-relaxed">
               <span className="font-semibold text-slate-500">Medical Disclaimer:</span> This AI assistant is for appointment scheduling only. It cannot provide medical advice, diagnosis, or treatment. In case of emergency, please visit the nearest hospital or contact emergency services immediately.
             </p>
           </div>
        </div>

        {/* Right Column: Real-time Info */}
        <div className="lg:col-span-1 h-full">
           <AppointmentDetails data={lastAppointment} />
        </div>
      </main>
    </div>
  );
}

export default App;