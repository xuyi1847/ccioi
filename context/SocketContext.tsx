
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
  const [serverUrl, setServerUrl] = useState('wss://www.ccioi.com/ws');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.CONNECTING || 
        socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log(`CCIOI Bridge: Attempting connection to ${serverUrl}`);
      const ws = new WebSocket(serverUrl);
      
      ws.onopen = () => {
        setIsConnected(true);
        console.log('CCIOI Bridge: Connected');
      };

      ws.onmessage = (event) => {
        setLastMessage(event.data);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        socketRef.current = null;
        console.log(`CCIOI Bridge: Socket closed. Code: ${event.code}`);
        
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 5000);
        }
      };

      ws.onerror = (error) => {
        console.error('CCIOI Bridge: Connection error detected.');
      };

      socketRef.current = ws;
    } catch (e) {
      console.error('CCIOI Bridge: Initialization Error', e);
    }
  }, [serverUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  const sendCommand = (command: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
    } else {
      console.error('CCIOI Bridge: Cannot send - Socket is not ready.');
      alert(`The CCIOI Bridge server is currently offline.`);
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
