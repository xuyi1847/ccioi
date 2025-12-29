
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface SocketContextType {
  isConnected: boolean;
  lastMessage: string | null;
  sendCommand: (command: any) => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('ws://localhost:8000/ws');
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log(`CCIOI Bridge: Connecting to ${serverUrl}...`);
      const ws = new WebSocket(serverUrl);
      
      ws.onopen = () => {
        setIsConnected(true);
        console.log('CCIOI Bridge: Connection established');
      };

      ws.onmessage = (event) => {
        setLastMessage(event.data);
        try {
          const parsed = JSON.parse(event.data);
          console.log('CCIOI Bridge: Message received', parsed);
        } catch (e) {
          console.log('CCIOI Bridge: Raw message', event.data);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        socketRef.current = null;
        if (!event.wasClean) {
          console.warn('CCIOI Bridge: Connection lost unexpectedly. Retrying in 5s...');
          setTimeout(connect, 5000);
        }
      };

      ws.onerror = (error) => {
        // Detailed error reporting
        console.error('CCIOI Bridge: WebSocket technical error encountered.');
        console.dir(error); // Using dir to inspect the object in the console
      };

      socketRef.current = ws;
    } catch (e) {
      console.error('CCIOI Bridge: Initialization failed', e);
    }
  }, [serverUrl]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
    };
  }, [connect]);

  const sendCommand = (command: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
      console.log('CCIOI Bridge: Outbound task dispatched');
    } else {
      console.error('CCIOI Bridge: Dispatch failed - socket is not open.');
      alert('Connection Error: The bridge server at ' + serverUrl + ' is unreachable. Please ensure "python server.py" is running.');
    }
  };

  return (
    <SocketContext.Provider value={{ isConnected, lastMessage, sendCommand, serverUrl, setServerUrl }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
