// src/hooks/useVnc.ts
"use client";

import { useState, useEffect, useCallback } from 'react';

export interface VncHookState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  frameData: string | null; // Example: a string that changes to trigger redraw
  remoteScreenDimensions: { width: number; height: number } | null;
}

export interface VncHookActions {
  connect: (options: { host: string; port: number; password?: string }) => void;
  disconnect: () => void;
  sendMouseEvent: (event: MouseInputEvent) => void;
  sendKeyboardEvent: (event: KeyboardInputEvent) => void;
}

export interface MouseInputEvent {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'wheel';
  x?: number;
  y?: number;
  button?: number;
  deltaY?: number;
}

export interface KeyboardInputEvent {
  type: 'keydown' | 'keyup';
  key: string;
  code: string;
}

const useVnc = (): VncHookState & VncHookActions => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameData, setFrameData] = useState<string | null>(null);
  const [remoteScreenDimensions, setRemoteScreenDimensions] = useState<{ width: number; height: number } | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const connect = useCallback((options: { host: string; port: number; password?: string }) => {
    console.log('Attempting to connect to VNC server:', options);
    setIsConnecting(true);
    setError(null);
    
    // Simulate connection attempt
    setTimeout(() => {
      setIsConnecting(false);
      // Simulate different outcomes based on host/port for demonstration
      if (options.host === 'fail') {
        setError('Mock Connection Failed: Host unreachable');
        setIsConnected(false);
      } else if (options.port === 9999) {
        setError('Mock Connection Failed: Invalid port');
        setIsConnected(false);
      } else {
        // Simulate successful connection
        setIsConnected(true);
        const widths = [1024, 1280, 800];
        const heights = [768, 720, 600];
        const randomIndex = Math.floor(Math.random() * widths.length);
        setRemoteScreenDimensions({ width: widths[randomIndex], height: heights[randomIndex] });
        setFrameData(`frame-${Date.now()}`);
        console.log('VNC Connected (mock)');
      }
    }, 2000 + Math.random() * 1000); // Add some randomness to connection time
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setRemoteScreenDimensions(null);
    setFrameData(null);
    console.log('VNC Disconnected (mock)');
  }, []);

  const sendMouseEvent = useCallback((event: MouseInputEvent) => {
    if (!isConnected) return;
    console.log('Sending mouse event (mock):', event);
  }, [isConnected]);

  const sendKeyboardEvent = useCallback((event: KeyboardInputEvent) => {
    if (!isConnected) return;
    console.log('Sending keyboard event (mock):', event);
  }, [isConnected]);

  // Simulate receiving frames periodically
  useEffect(() => {
    if (isConnected) {
      const intervalId = setInterval(() => {
        setFrameData(`frame-${Date.now()}`);
      }, 3000 + Math.random() * 2000); // Random interval for frame updates
      return () => clearInterval(intervalId);
    }
  }, [isConnected]);

  return {
    isConnected,
    isConnecting,
    error,
    frameData,
    remoteScreenDimensions,
    connect,
    disconnect,
    sendMouseEvent,
    sendKeyboardEvent,
  };
};

export default useVnc;
