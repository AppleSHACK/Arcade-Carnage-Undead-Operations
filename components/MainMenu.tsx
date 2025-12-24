import React, { useCallback, useEffect, useRef } from 'react';

interface MainMenuProps {
  onStart: () => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onBack: () => void;
  currentView: 'MENU' | 'SETTINGS' | 'CREDITS';
}

const MainMenu: React.FC<MainMenuProps> = ({ onStart, onOpenSettings, onOpenCredits, onBack, currentView }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundtrackNodesRef = useRef<AudioNode[]>([]);
  const sequencerIntervalRef = useRef<number | null>(null);

  // Procedural Soundtrack Synthesis
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 3); // Slightly slower fade in
    masterGain.connect(ctx.destination);

    // Harmonic Palette (D Minor / Phrygian vibes)
    const chords = [
      { bass: 73.42, pad1: 146.83, pad2: 174.61 }, // D2, D3, F3
      { bass: 58.27, pad1: 116.54, pad2: 138.59 }, // Bb1, Bb2, Db3 (tension)
      { bass: 73.42, pad1: 146.83, pad2: 174.61 }, // D2, D3, F3
      { bass: 65.41, pad1: 130.81, pad2: 164.81 }  // C2, C3, E3
    ];
    let currentChordIdx = 0;

    // 1. Bass Drone Node
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'triangle';
    bassGain.gain.setValueAtTime(0.18, ctx.currentTime);
    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start();

    // 2. Pad Nodes
    const pad1Osc = ctx.createOscillator();
    const pad1Gain = ctx.createGain();
    const pad1Filter = ctx.createBiquadFilter();
    pad1Osc.type = 'sine';
    pad1Filter.type = 'lowpass';
    pad1Filter.Q.setValueAtTime(5, ctx.currentTime);
    pad1Osc.connect(pad1Filter);
    pad1Filter.connect(pad1Gain);
    pad1Gain.connect(masterGain);
    pad1Gain.gain.setValueAtTime(0.06, ctx.currentTime);
    pad1Osc.start();

    const pad2Osc = ctx.createOscillator();
    const pad2Gain = ctx.createGain();
    pad2Osc.type = 'sine';
    pad2Osc.connect(pad2Gain);
    pad2Gain.connect(masterGain);
    pad2Gain.gain.setValueAtTime(0.04, ctx.currentTime);
    pad2Osc.start();

    // 3. Heartbeat Pulse
    const pulseOsc = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    const pulseFilter = ctx.createBiquadFilter();
    pulseOsc.type = 'square';
    pulseOsc.frequency.setValueAtTime(36.71, ctx.currentTime); // D1
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.setValueAtTime(80, ctx.currentTime);
    pulseGain.gain.setValueAtTime(0, ctx.currentTime);
    pulseOsc.connect(pulseFilter);
    pulseFilter.connect(pulseGain);
    pulseGain.connect(masterGain);
    pulseOsc.start();

    // 4. Melodic Arp (The "Personality")
    const arpOsc = ctx.createOscillator();
    const arpGain = ctx.createGain();
    const arpFilter = ctx.createBiquadFilter();
    arpOsc.type = 'sawtooth';
    arpFilter.type = 'lowpass';
    arpFilter.frequency.setValueAtTime(400, ctx.currentTime);
    arpFilter.Q.setValueAtTime(10, ctx.currentTime);
    arpGain.gain.setValueAtTime(0, ctx.currentTime);
    arpOsc.connect(arpFilter);
    arpFilter.connect(arpGain);
    arpGain.connect(masterGain);
    arpOsc.start();

    // Sequencer Logic
    let step = 0;
    const interval = window.setInterval(() => {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;

      // Heartbeat pulse every 2 steps (8th notes basically)
      if (step % 4 === 0) {
        pulseGain.gain.cancelScheduledValues(now);
        // Using setTargetAtTime to avoid clicks from abrupt setValueAtTime jumps
        pulseGain.gain.setTargetAtTime(0.25, now, 0.01);
        pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      }

      // Melodic Arpeggio Sequence
      const arpNotes = [1, 1.5, 1.25, 2, 1.5, 3, 2, 1.25]; // Multipliers
      const baseFreq = chords[currentChordIdx].pad1 * 2;
      arpOsc.frequency.setTargetAtTime(baseFreq * arpNotes[step % arpNotes.length], now, 0.05);
      arpGain.gain.cancelScheduledValues(now);
      // Smoothed attack to prevent clicking
      arpGain.gain.setTargetAtTime(0.02, now, 0.005);
      arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      
      // Filter sweep on pad for mystery
      const filterFreq = 400 + Math.sin(now * 0.5) * 300;
      pad1Filter.frequency.setTargetAtTime(filterFreq, now, 0.1);

      // Harmonic shift every 16 steps
      if (step % 16 === 0) {
        currentChordIdx = (currentChordIdx + 1) % chords.length;
        const c = chords[currentChordIdx];
        bassOsc.frequency.setTargetAtTime(c.bass, now, 1.5);
        pad1Osc.frequency.setTargetAtTime(c.pad1, now, 2.0);
        pad2Osc.frequency.setTargetAtTime(c.pad2, now, 2.5);
      }

      step++;
    }, 250); // 120 BPM roughly

    sequencerIntervalRef.current = interval;
    soundtrackNodesRef.current = [bassOsc, pad1Osc, pad1Filter, pad2Osc, pulseOsc, pulseFilter, arpOsc, arpFilter, masterGain];

    return () => {
      if (sequencerIntervalRef.current) clearInterval(sequencerIntervalRef.current);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0); // Smooth fade out
      setTimeout(() => {
        soundtrackNodesRef.current.forEach(node => {
          if (node instanceof OscillatorNode) node.stop();
          node.disconnect();
        });
        if (ctx.state !== 'closed') ctx.close();
      }, 1200);
    };
  }, []);

  // Audio Synthesis for Hover/Click Effects
  const playSfx = useCallback((freq: number, type: 'hover' | 'click') => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type === 'click' ? 'square' : 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    // Prevent starting click
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === 'click' ? 0.3 : 0.1));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (type === 'click' ? 0.3 : 0.1));
  }, []);

  const handleHover = () => playSfx(440, 'hover');
  const handleClick = (callback: () => void) => {
    playSfx(220, 'click');
    callback();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-10 font-sans text-white select-none">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[-1] bg-[length:100%_2px,3px_100%]" />

      <div className="max-w-4xl w-full flex flex-col items-center animate-in fade-in zoom-in duration-700">
        
        {currentView === 'MENU' && (
          <>
            <div className="text-center mb-16 relative">
              <div className="absolute -inset-4 bg-red-600/20 blur-2xl rounded-full animate-pulse" />
              <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] leading-tight">
                ARCADE <span className="text-red-600">CARNAGE</span>
              </h1>
              <p className="text-xl md:text-2xl font-mono tracking-[0.5em] text-slate-400 mt-2">
                UNDEAD OPERATIONS
              </p>
            </div>

            <div className="flex flex-col gap-4 w-full max-w-xs">
              <MenuButton 
                label="START OPERATION" 
                primary 
                onHover={handleHover} 
                onClick={() => handleClick(onStart)} 
              />
              <MenuButton 
                label="CONFIGURATION" 
                onHover={handleHover} 
                onClick={() => handleClick(onOpenSettings)} 
              />
              <MenuButton 
                label="PERSONNEL RECORDS" 
                onHover={handleHover} 
                onClick={() => handleClick(onOpenCredits)} 
              />
            </div>
          </>
        )}

        {currentView === 'SETTINGS' && (
          <div className="bg-slate-900/90 border border-slate-700 p-8 rounded-lg w-full max-w-lg animate-in slide-in-from-bottom-10 duration-500 backdrop-blur-xl shadow-2xl">
            <h2 className="text-3xl font-black italic mb-6 border-b border-slate-700 pb-2">CONFIGURATION</h2>
            <div className="space-y-6 mb-8 text-slate-300">
              <div className="flex justify-between items-center">
                <span className="font-bold tracking-widest text-xs uppercase">Rendering Quality</span>
                <span className="text-blue-400 font-mono text-sm">ULTRA (3D)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold tracking-widest text-xs uppercase">Audio Output</span>
                <span className="text-blue-400 font-mono text-sm">SPATIAL SYNTH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold tracking-widest text-xs uppercase">Inversion</span>
                <span className="text-slate-500 font-mono text-sm">OFF</span>
              </div>
            </div>
            <MenuButton label="BACK TO TERMINAL" onHover={handleHover} onClick={() => handleClick(onBack)} />
          </div>
        )}

        {currentView === 'CREDITS' && (
          <div className="bg-slate-900/90 border border-slate-700 p-8 rounded-lg w-full max-w-lg animate-in slide-in-from-bottom-10 duration-500 backdrop-blur-xl shadow-2xl text-center">
            <h2 className="text-3xl font-black italic mb-6 border-b border-slate-700 pb-2">CREDITS</h2>
            <div className="space-y-4 mb-8">
              <div className="group">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Operation Command</p>
                <p className="text-xl font-bold text-blue-400">Chief Engineer</p>
              </div>
              <div className="group">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Visual Architect</p>
                <p className="text-xl font-bold text-indigo-400">Three.js Engine v0.170</p>
              </div>
              <div className="group">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Logistics & Audio</p>
                <p className="text-xl font-bold text-emerald-400">Tactical Web Audio API</p>
              </div>
            </div>
            <MenuButton label="BACK TO TERMINAL" onHover={handleHover} onClick={() => handleClick(onBack)} />
          </div>
        )}

        <div className="mt-20 text-[10px] text-slate-600 font-mono uppercase tracking-[0.4em]">
          SYS_STATUS: READY // ENCRYPTION: ACTIVE // V.0.1.4
        </div>
      </div>
    </div>
  );
};

interface MenuButtonProps {
  label: string;
  onClick: () => void;
  onHover: () => void;
  primary?: boolean;
}

const MenuButton: React.FC<MenuButtonProps> = ({ label, onClick, onHover, primary }) => {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={`
        group relative px-6 py-4 font-black italic tracking-tighter text-left transition-all duration-200 overflow-hidden
        ${primary 
          ? 'bg-red-600 text-white hover:bg-red-500 hover:scale-105 active:scale-95' 
          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10 hover:border-white/20'
        }
      `}
    >
      <div className="relative z-10 flex justify-between items-center">
        <span>{label}</span>
        <div className={`w-2 h-2 rounded-full ${primary ? 'bg-white animate-pulse' : 'bg-slate-600 group-hover:bg-blue-400 transition-colors'}`} />
      </div>
      <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
    </button>
  );
};

export default MainMenu;