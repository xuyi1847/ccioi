
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface SocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: string | null;
  sendCommand: (command: any) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const DEFAULT_WS_URL = IS_DEV ? 'ws://127.0.0.1:8000/ws' : 'wss://www.ccioi.com/ws';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_WS_URL);
  const socketRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef<boolean>(false);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setLastMessage(null);
  }, []);

  const connect = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      setIsConnecting(true);
      manualCloseRef.current = false;
      
      try {
        console.log(`CCIOI Bridge: Initiating session at ${serverUrl}`);
        const ws = new WebSocket(serverUrl);
        
        const timeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            setIsConnecting(false);
            reject(new Error("Connection timeout"));
          }
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          setIsConnected(true);
          setIsConnecting(false);
          console.log('CCIOI Bridge: Session Active');
          resolve();
        };

        ws.onmessage = (event) => {
          setLastMessage(event.data);
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          setIsConnecting(false);
          socketRef.current = null;
          console.log(`CCIOI Bridge: Session Closed (${event.code})`);
          
          // Only auto-reconnect if it wasn't a manual close and we were previously connected
          if (!manualCloseRef.current && event.code !== 1000) {
            console.log("CCIOI Bridge: Unexpected disconnect, please retry generation.");
          }
        };

        ws.onerror = (error) => {
          console.error('CCIOI Bridge: Socket error');
          setIsConnecting(false);
          reject(error);
        };

        socketRef.current = ws;
      } catch (e) {
        setIsConnecting(false);
        console.error('CCIOI Bridge: Initialization Error', e);
        reject(e);
      }
    });
  }, [serverUrl]);

  const sendCommand = useCallback((command: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
    } else {
      console.error('CCIOI Bridge: Cannot send - Session not active.');
      throw new Error('Socket session is not active.');
    }
  }, []);

  return (
    <SocketContext.Provider value={{ 
      isConnected, 
      isConnecting,
      lastMessage, 
      sendCommand, 
      connect, 
      disconnect,
      serverUrl, 
      setServerUrl 
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
