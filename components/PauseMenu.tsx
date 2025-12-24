
import React, { useEffect, useRef } from 'react';

interface PauseMenuProps {
  onResume: () => void;
  onAbort: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onAbort }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 2); // Subtle volume
    masterGain.connect(ctx.destination);

    // 1. Deep Sub Drone (36.71Hz - D1)
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    droneOsc.type = 'triangle';
    droneOsc.frequency.setValueAtTime(36.71, ctx.currentTime);
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(60, ctx.currentTime);
    droneGain.gain.setValueAtTime(0.2, ctx.currentTime);
    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(masterGain);
    droneOsc.start();

    // 2. Breathing Pad (146.83Hz - D3)
    const padOsc = ctx.createOscillator();
    const padGain = ctx.createGain();
    const padFilter = ctx.createBiquadFilter();
    padOsc.type = 'sine';
    padOsc.frequency.setValueAtTime(146.83, ctx.currentTime);
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(200, ctx.currentTime);
    padGain.gain.setValueAtTime(0.08, ctx.currentTime);
    
    // Slow breathing filter modulation
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime); // 0.15Hz breathing
    lfoGain.gain.setValueAtTime(100, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();
    lfo.start();

    // 3. Resting Heartbeat Pulse
    const pulseOsc = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    const pulseFilter = ctx.createBiquadFilter();
    pulseOsc.type = 'square';
    pulseOsc.frequency.setValueAtTime(40, ctx.currentTime);
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.setValueAtTime(80, ctx.currentTime);
    pulseGain.gain.setValueAtTime(0, ctx.currentTime);
    pulseOsc.connect(pulseFilter);
    pulseFilter.connect(pulseGain);
    pulseGain.connect(masterGain);
    pulseOsc.start();

    const interval = window.setInterval(() => {
      if (ctx.state === 'running') {
        const now = ctx.currentTime;
        pulseGain.gain.cancelScheduledValues(now);
        pulseGain.gain.setValueAtTime(0, now);
        pulseGain.gain.exponentialRampToValueAtTime(0.1, now + 0.1);
        pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      }
    }, 2400); // Slower, 50 BPM heartbeat

    nodesRef.current = [droneOsc, droneFilter, droneGain, padOsc, padFilter, padGain, lfo, lfoGain, pulseOsc, pulseFilter, pulseGain, masterGain];

    return () => {
      clearInterval(interval);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      setTimeout(() => {
        nodesRef.current.forEach(n => {
          if (n instanceof OscillatorNode) n.stop();
          n.disconnect();
        });
        if (ctx.state !== 'closed') ctx.close();
      }, 600);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in duration-500">
      <div className="text-center p-12 border-y border-red-500/30 bg-gradient-to-r from-transparent via-red-950/20 to-transparent w-full">
        <h2 className="text-5xl font-black italic tracking-tighter text-white mb-2 animate-pulse">OPERATION SUSPENDED</h2>
        <p className="text-red-500 font-mono tracking-[0.5em] text-sm uppercase">Biometric Link Offline</p>
        <div className="mt-12 flex flex-col items-center gap-4">
          <button 
            onClick={onResume}
            className="px-8 py-3 bg-white text-black font-black italic tracking-tighter hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            RESUME MISSION
          </button>
          <button 
            onClick={onAbort}
            className="text-slate-500 hover:text-white font-mono text-xs tracking-widest uppercase transition-colors"
          >
            ABORT TO TERMINAL
          </button>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;
