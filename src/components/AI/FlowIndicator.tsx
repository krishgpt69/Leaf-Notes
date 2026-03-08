import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Flame, Zap, Wind, Coffee, Rocket } from 'lucide-react';
import { flowDetector, type FlowState } from '../../lib/flow-detector';

const LEVEL_CONFIG = {
    idle: { icon: Coffee, label: 'Idle', color: 'rgba(255,255,255,0.2)', glow: 'none' },
    warming: { icon: Wind, label: 'Warming Up', color: '#60a5fa', glow: '0 0 8px rgba(96,165,250,0.4)' },
    flowing: { icon: Zap, label: 'Flowing', color: '#34d399', glow: '0 0 12px rgba(52,211,153,0.5)' },
    deep: { icon: Flame, label: 'Deep Flow', color: '#f59e0b', glow: '0 0 16px rgba(245,158,11,0.5)' },
    peak: { icon: Rocket, label: 'Peak Flow!', color: '#ef4444', glow: '0 0 20px rgba(239,68,68,0.6)' },
} as const;

const IDLE: FlowState = { score: 0, level: 'idle', wpm: 0, sessionMinutes: 0, streakWords: 0 };

function FlowIndicatorInner({ wordCount }: { wordCount: number }) {
    const [flow, setFlow] = useState<FlowState>(IDLE);
    const prevWcRef = useRef(wordCount);

    useEffect(() => {
        flowDetector.start(setFlow);
        return () => flowDetector.stop();
    }, []);

    useEffect(() => {
        if (wordCount !== prevWcRef.current) {
            prevWcRef.current = wordCount;
            flowDetector.recordWordChange(wordCount);
        }
    }, [wordCount]);

    const handleKey = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Meta' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift') return;
        if (e.metaKey || e.ctrlKey) return;
        flowDetector.recordKeystroke(e.key === 'Backspace' || e.key === 'Delete');
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleKey]);

    const cfg = LEVEL_CONFIG[flow.level];
    const Icon = cfg.icon;

    if (flow.level === 'idle' && flow.sessionMinutes === 0) return null;

    return (
        <div className="flow-indicator" style={{ '--flow-color': cfg.color, '--flow-glow': cfg.glow } as React.CSSProperties}>
            <div className="flow-bar">
                <div className="flow-bar-fill" style={{ width: `${flow.score}%` }} />
            </div>
            <div className="flow-info">
                <Icon size={13} className="flow-icon" />
                <span className="flow-label">{cfg.label}</span>
                {flow.wpm > 0 && <span className="flow-wpm">{flow.wpm} wpm</span>}
                {flow.sessionMinutes > 0 && <span className="flow-time">{flow.sessionMinutes}m</span>}
                {flow.streakWords > 20 && <span className="flow-streak">🔥 {flow.streakWords} words</span>}
            </div>
        </div>
    );
}

export default memo(FlowIndicatorInner);
