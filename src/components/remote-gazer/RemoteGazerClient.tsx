// src/components/remote-gazer/RemoteGazerClient.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useVnc from '@/hooks/useVnc';
import Toolbar from './Toolbar';
import RemoteDisplay from './RemoteDisplay';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react'; // For loading spinner

const RemoteGazerClient: React.FC = () => {
  const {
    isConnected, isConnecting, error, frameData, remoteScreenDimensions,
    connect, disconnect, sendMouseEvent, sendKeyboardEvent
  } = useVnc();

  const [scale, setScale] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const remoteDisplayContainerRef = useRef<HTMLDivElement>(null); // For fullscreen and fit-to-window logic
  const canvasRef = useRef<HTMLCanvasElement>(null); // For snapshot

  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5901');
  const [password, setPassword] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({
        title: "Connection Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleConnect = () => {
    if (!host || !port) {
      toast({
        title: "Connection Failed",
        description: "Host and Port are required.",
        variant: "destructive",
      });
      return;
    }
    connect({ host, port: parseInt(port, 10), password });
  };

  const handleScaleChange = useCallback((newScale: number | 'fit') => {
    if (newScale === 'fit') {
      if (remoteDisplayContainerRef.current && remoteScreenDimensions) {
        // Ensure the container has non-zero dimensions
        const containerWidth = remoteDisplayContainerRef.current.offsetWidth;
        const containerHeight = remoteDisplayContainerRef.current.offsetHeight;
        if (containerWidth > 0 && containerHeight > 0) {
            const scaleX = containerWidth / remoteScreenDimensions.width;
            const scaleY = containerHeight / remoteScreenDimensions.height;
            setScale(Math.min(scaleX, scaleY, 2)); // Cap max scale from 'fit' to 2x
        } else {
            setScale(1); // Fallback if container dimensions are zero
        }
      } else {
        setScale(1); // Fallback if dimensions/ref not available
      }
    } else {
      setScale(Math.max(0.1, Math.min(newScale, 5))); // Clamp scale between 0.1x and 5x
    }
  }, [remoteScreenDimensions]);


  const toggleFullScreen = useCallback(async () => {
    const element = remoteDisplayContainerRef.current; // Use the container for fullscreen
    if (!element) return;

    if (typeof document !== 'undefined' && !document.fullscreenElement) {
      try {
        await element.requestFullscreen();
        // Fullscreen state is handled by the event listener
      } catch (err: any) {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        setIsFullScreen(false); // Ensure state consistency if request fails
         toast({
            title: "Fullscreen Error",
            description: "Could not enter fullscreen mode.",
            variant: "destructive",
        });
      }
    } else if (typeof document !== 'undefined' && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch (err: any) {
        console.error(`Error attempting to exit full-screen mode: ${err.message} (${err.name})`);
      }
    }
  }, []);

  useEffect(() => {
    const fullscreenChangeHandler = () => {
      if (typeof document !== 'undefined') {
        const currentlyFullScreen = !!document.fullscreenElement;
        setIsFullScreen(currentlyFullScreen);
        if (currentlyFullScreen) {
            handleScaleChange('fit'); // Fit to window when entering fullscreen
        }
      }
    };
    if (typeof document !== 'undefined') {
        document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
      }
    };
  }, [handleScaleChange]);


  const handleSnapshot = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `web-vnc-viewer-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link); // Required for Firefox
      link.click();
      document.body.removeChild(link);
      toast({ title: "Snapshot Taken", description: "Image has been downloaded." });
    } else {
       toast({ title: "Snapshot Failed", description: "Remote display is not available.", variant: "destructive" });
    }
  };


  if (!isConnected && !isConnecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Card className="w-full max-w-md shadow-xl rounded-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary">Web VNC Viewer</CardTitle>
            <CardDescription className="text-muted-foreground">Enter VNC server details to connect</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="e.g., 192.168.1.100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="e.g., 5900" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (optional)</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password if required" />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleConnect} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-lg py-6 rounded-md">
              Connect
            </Button>
          </CardFooter>
        </Card>
        {error && <p className="mt-4 text-sm text-destructive text-center">{error}</p>}
      </div>
    );
  }
  
  if (isConnecting) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="mt-6 text-xl text-muted-foreground font-medium">Connecting to {host}:{port}...</p>
      </div>
    );
  }

  // Connected state
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Toolbar
        isConnected={isConnected}
        onDisconnect={disconnect}
        scale={scale}
        onScaleChange={handleScaleChange}
        isFullScreen={isFullScreen}
        onToggleFullScreen={toggleFullScreen}
        onSnapshot={handleSnapshot}
      />
      <div 
        ref={remoteDisplayContainerRef} 
        className="flex-grow overflow-hidden bg-gray-700 flex items-center justify-center p-1 relative"
        // This dark background provides contrast if the canvas is smaller than the container.
      >
        {remoteScreenDimensions ? (
          <RemoteDisplay
            ref={canvasRef}
            frameData={frameData}
            dimensions={remoteScreenDimensions}
            scale={scale}
            onMouseEvent={sendMouseEvent}
            onKeyboardEvent={sendKeyboardEvent}
          />
        ) : (
          <div className="flex flex-col items-center text-gray-400">
            <Loader2 className="h-12 w-12 animate-spin" />
            <p className="mt-4 text-lg">Waiting for remote screen data...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteGazerClient;
