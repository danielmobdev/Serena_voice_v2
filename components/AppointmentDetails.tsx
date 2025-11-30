import React from 'react';
import { AppointmentData } from '../types';

interface Props {
  data: AppointmentData | null;
}

const AppointmentDetails: React.FC<Props> = ({ data }) => {
  if (!data) return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex items-center justify-center text-slate-400 text-sm">
      <div className="text-center">
        <p>Appointment details will appear here</p>
        <p>after confirmation.</p>
      </div>
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border-l-4 border-teal-500 h-full overflow-y-auto">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-slate-800">Appointment Confirmed</h3>
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Saved to Sheets</span>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Patient Name</p>
            <p className="font-semibold text-slate-800">{data.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Age</p>
            <p className="font-semibold text-slate-800">{data.age}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Mobile</p>
          <p className="font-medium text-slate-700 font-mono">{data.mobile}</p>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg">
           <div className="flex justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase">Date</p>
                <p className="font-bold text-teal-700">{data.appointmentDate}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase">Time</p>
                <p className="font-bold text-teal-700">{data.appointmentTime}</p>
              </div>
           </div>
        </div>

        <div>
           <p className="text-xs text-slate-500 uppercase tracking-wide">Type</p>
           <p className="text-sm font-medium">{data.visitType}</p>
        </div>

        <div>
           <p className="text-xs text-slate-500 uppercase tracking-wide">Fee</p>
           <p className="text-xl font-bold text-slate-800">₹{data.fee}</p>
        </div>

        <div className="pt-4 border-t border-slate-100">
           <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Concern</p>
           <p className="text-sm text-slate-600 italic bg-yellow-50 p-2 rounded">"{data.concern}"</p>
        </div>
      </div>
    </div>
  );
};

export default AppointmentDetails;