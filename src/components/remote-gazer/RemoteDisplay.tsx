// src/components/remote-gazer/RemoteDisplay.tsx
"use client";

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { MouseInputEvent, KeyboardInputEvent } from '@/hooks/useVnc';

interface RemoteDisplayProps {
  frameData: string | null; // Example: a string that changes to trigger redraw
  dimensions: { width: number; height: number };
  scale: number;
  onMouseEvent: (event: MouseInputEvent) => void;
  onKeyboardEvent: (event: KeyboardInputEvent) => void;
}

const RemoteDisplay = forwardRef<HTMLCanvasElement, RemoteDisplayProps>(
  ({ frameData, dimensions, scale, onMouseEvent, onKeyboardEvent }, ref) => {
    const internalCanvasRef = useRef<HTMLCanvasElement>(null);
    // Expose the internalCanvasRef to the parent component via the passed ref
    useImperativeHandle(ref, () => internalCanvasRef.current!, []);

    useEffect(() => {
      const canvas = internalCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      
      // Set the actual size of the canvas element
      canvas.width = dimensions.width * dpr;
      canvas.height = dimensions.height * dpr;

      // Set the display size of the canvas element using CSS
      canvas.style.width = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      
      // Scale the drawing context to account for DPR
      ctx.scale(dpr, dpr);

      // Clear canvas with a background color that suits the "remote desktop" feel
      ctx.fillStyle = '#2D3748'; // A dark bluish-gray
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Draw placeholder content
      ctx.fillStyle = '#A0AEC0'; // Light gray text for contrast
      const fontSize = Math.min(24, dimensions.width / 30); // Responsive font size
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(`Remote Desktop View`, dimensions.width / 2, dimensions.height / 2 - fontSize * 1.5);
      ctx.font = `${fontSize * 0.8}px Inter, sans-serif`;
      ctx.fillText(`(${dimensions.width} x ${dimensions.height})`, dimensions.width / 2, dimensions.height / 2);
      ctx.fillText(`Mock Frame: ${frameData || 'Initializing...'}`, dimensions.width / 2, dimensions.height / 2 + fontSize * 1.5);
      
      // Draw a subtle grid for visual texture
      ctx.strokeStyle = 'rgba(160, 174, 192, 0.1)'; // Very faint grid lines
      ctx.lineWidth = 1;
      for (let x = 0; x < dimensions.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
        ctx.stroke();
      }
      for (let y = 0; y < dimensions.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
        ctx.stroke();
      }

      // Draw a border around the canvas content area
      ctx.strokeStyle = '#4A5568'; // A slightly lighter border than background
      ctx.lineWidth = 2; // Make border 2px from the edge inside
      ctx.strokeRect(1, 1, dimensions.width - 2, dimensions.height - 2);

    }, [frameData, dimensions, scale]); // scale is used in CSS transform, but redraw may be needed if content depends on scale

    useEffect(() => {
      const canvas = internalCanvasRef.current;
      if (!canvas) return;

      const getScaledCoordinates = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        // Raw click position relative to viewport
        const clientX = e.clientX;
        const clientY = e.clientY;
        // Position relative to scaled canvas's top-left
        const xRelativeToCanvas = clientX - rect.left;
        const yRelativeToCanvas = clientY - rect.top;
        // Descale to get original coordinates
        return {
            x: xRelativeToCanvas / scale,
            y: yRelativeToCanvas / scale
        };
      };

      const handleMouseDown = (e: MouseEvent) => {
        canvas.focus(); // Ensure canvas has focus for keyboard events
        const {x, y} = getScaledCoordinates(e);
        onMouseEvent({ type: 'mousedown', x, y, button: e.button });
      };
      const handleMouseUp = (e: MouseEvent) => {
        const {x, y} = getScaledCoordinates(e);
        onMouseEvent({ type: 'mouseup', x, y, button: e.button });
      };
      const handleMouseMove = (e: MouseEvent) => {
        const {x, y} = getScaledCoordinates(e);
        onMouseEvent({ type: 'mousemove', x, y });
      };
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault(); // Prevent page scrolling
        onMouseEvent({ type: 'wheel', deltaY: e.deltaY });
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        // Prevent default browser actions for common shortcuts if canvas is focused
        if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key) || (e.ctrlKey || e.metaKey)) {
           // e.preventDefault(); // Be careful with this, might block essential browser functions
        }
        onKeyboardEvent({ type: 'keydown', key: e.key, code: e.code });
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        onKeyboardEvent({ type: 'keyup', key: e.key, code: e.code });
      };
      
      const handleContextMenu = (e: MouseEvent) => e.preventDefault(); // Prevent default right-click menu

      canvas.tabIndex = 0; // Make canvas focusable

      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('keydown', handleKeyDown);
      canvas.addEventListener('keyup', handleKeyUp);
      canvas.addEventListener('contextmenu', handleContextMenu);

      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('keydown', handleKeyDown);
        canvas.removeEventListener('keyup', handleKeyUp);
        canvas.removeEventListener('contextmenu', handleContextMenu);
      };
    }, [onMouseEvent, onKeyboardEvent, scale, dimensions]); // Ensure handlers update if these props change

    return (
      <canvas
        ref={internalCanvasRef}
        className="transition-transform duration-100 ease-linear shadow-2xl border border-gray-700 rounded-sm"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        aria-label="Remote desktop display"
        role="application" // Indicates this is an interactive application area
      />
    );
  }
);

RemoteDisplay.displayName = 'RemoteDisplay';
export default RemoteDisplay;
