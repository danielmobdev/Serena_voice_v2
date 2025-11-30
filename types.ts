export interface AppointmentData {
  name: string;
  age: number;
  mobile: string;
  visitType: 'First Visit' | 'Follow-up';
  concern: string;
  appointmentDate: string;
  appointmentTime: string;
  followUpInterval?: string;
  fee: number;
  language?: string;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'user' | 'ai' | 'system';
}