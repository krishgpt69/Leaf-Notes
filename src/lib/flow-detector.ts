/* ═══════════════════════════════════════════════════════════════
   🔥 Flow State Detector — Real-time writing flow analysis
   ═══════════════════════════════════════════════════════════════ */

export interface FlowState {
    score: number;
    level: 'idle' | 'warming' | 'flowing' | 'deep' | 'peak';
    wpm: number;
    sessionMinutes: number;
    streakWords: number;
}

type FlowCallback = (state: FlowState) => void;

class FlowDetector {
    private keyTimestamps: number[] = [];
    private wordTimestamps: number[] = [];
    private sessionStart: number | null = null;
    private streakWords = 0;
    private lastWordCount = 0;
    private deleteCount = 0;
    private totalKeys = 0;

    private listener: FlowCallback | null = null;
    private tickId: ReturnType<typeof setInterval> | null = null;

    start(cb: FlowCallback) {
        this.listener = cb;
        this.reset();
        this.tickId = setInterval(() => this.emit(), 3000);
    }

    stop() {
        if (this.tickId) clearInterval(this.tickId);
        this.tickId = null;
        this.listener = null;
        this.reset();
    }

    recordKeystroke(isDelete: boolean) {
        const now = Date.now();
        this.keyTimestamps.push(now);
        this.totalKeys++;
        if (isDelete) this.deleteCount++;

        const cutoff = now - 60_000;
        this.keyTimestamps = this.keyTimestamps.filter(t => t >= cutoff);

        if (this.keyTimestamps.length >= 2) {
            const prev = this.keyTimestamps[this.keyTimestamps.length - 2];
            if (now - prev > 10_000) {
                this.streakWords = 0;
                this.deleteCount = 0;
                this.totalKeys = 0;
            }
        }

        if (!this.sessionStart) this.sessionStart = now;
    }

    recordWordChange(newWordCount: number) {
        const delta = newWordCount - this.lastWordCount;
        if (delta > 0) {
            const now = Date.now();
            for (let i = 0; i < delta; i++) this.wordTimestamps.push(now);
            this.streakWords += delta;
            const cutoff = now - 60_000;
            this.wordTimestamps = this.wordTimestamps.filter(t => t >= cutoff);
        }
        this.lastWordCount = newWordCount;
    }

    private calculateWPM(): number {
        if (this.wordTimestamps.length < 2) return 0;
        const now = Date.now();
        const recent = this.wordTimestamps.filter(t => t >= now - 30_000);
        return recent.length < 2 ? 0 : Math.round(recent.length * 2);
    }

    private calculateScore(): number {
        const wpm = this.calculateWPM();
        const sessionMins = this.sessionStart ? (Date.now() - this.sessionStart) / 60_000 : 0;
        const speedScore = Math.min(40, (wpm / 60) * 40);
        const deleteRatio = this.totalKeys > 0 ? this.deleteCount / this.totalKeys : 0;
        const consistencyScore = Math.max(0, 20 - deleteRatio * 60);
        const durationScore = Math.min(20, (sessionMins / 15) * 20);
        const streakScore = Math.min(20, (this.streakWords / 200) * 20);
        return Math.round(speedScore + consistencyScore + durationScore + streakScore);
    }

    private getLevel(score: number): FlowState['level'] {
        if (score < 10) return 'idle';
        if (score < 30) return 'warming';
        if (score < 55) return 'flowing';
        if (score < 80) return 'deep';
        return 'peak';
    }

    private emit() {
        if (!this.listener) return;
        if (this.keyTimestamps.length === 0 ||
            Date.now() - this.keyTimestamps[this.keyTimestamps.length - 1] > 30_000) {
            this.listener({ score: 0, level: 'idle', wpm: 0, sessionMinutes: 0, streakWords: 0 });
            return;
        }
        const score = this.calculateScore();
        this.listener({
            score,
            level: this.getLevel(score),
            wpm: this.calculateWPM(),
            sessionMinutes: this.sessionStart ? Math.round((Date.now() - this.sessionStart) / 60_000) : 0,
            streakWords: this.streakWords,
        });
    }

    private reset() {
        this.keyTimestamps = [];
        this.wordTimestamps = [];
        this.sessionStart = null;
        this.streakWords = 0;
        this.lastWordCount = 0;
        this.deleteCount = 0;
        this.totalKeys = 0;
    }
}

export const flowDetector = new FlowDetector();
