// src/components/remote-gazer/Toolbar.tsx
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Power,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Camera,
  Expand, // For fit to window
  Shrink, // For exit fullscreen or could use Minimize
  Unplug,
  RotateCcw, // For reconnect/refresh
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolbarProps {
  isConnected: boolean;
  onConnect?: () => void; // Optional, connection might be handled by form
  onDisconnect: () => void;
  scale: number;
  onScaleChange: (newScale: number | 'fit') => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onSnapshot: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  isConnected,
  onDisconnect,
  scale,
  onScaleChange,
  isFullScreen,
  onToggleFullScreen,
  onSnapshot,
}) => {
  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <TooltipProvider delayDuration={200}>
      <header className="bg-card text-card-foreground p-2 shadow-md flex items-center justify-between space-x-2 print:hidden">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-semibold text-primary hidden sm:block">Web VNC Viewer</h1>
           {isConnected ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="icon" onClick={onDisconnect} aria-label="Disconnect">
                  <Unplug />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disconnect</TooltipContent>
            </Tooltip>
          ) : (
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" disabled aria-label="Disconnected">
                        <Power className="text-muted-foreground" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Currently Disconnected</TooltipContent>
            </Tooltip>
          )}
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'}></div>
          <span className="text-sm text-muted-foreground">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {isConnected && (
          <div className="flex items-center space-x-1 sm:space-x-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onScaleChange(Math.max(0.25, scale - 0.25))} aria-label="Zoom Out">
                  <ZoomOut />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out (Current: {Math.round(scale*100)}%)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onScaleChange(scale + 0.25)} aria-label="Zoom In">
                  <ZoomIn />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In (Current: {Math.round(scale*100)}%)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onScaleChange('fit')} aria-label="Fit to Window">
                  <Expand />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to Window</TooltipContent>
            </Tooltip>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onToggleFullScreen} aria-label={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}>
                  {isFullScreen ? <Shrink /> : <Maximize />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onSnapshot} aria-label="Take Snapshot">
                  <Camera />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Take Snapshot</TooltipContent>
            </Tooltip>
          </div>
        )}
         {!isConnected && <div className="flex-grow"></div>} {/* Spacer if not connected */}
      </header>
    </TooltipProvider>
  );
};

export default Toolbar;
