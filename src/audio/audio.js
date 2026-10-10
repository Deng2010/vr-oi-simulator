/* =========================================================
   WebAudio 程序化音效（无音频资源文件，零下载体积）
   由 index.html 内联脚本第 771-844 行拆出。
   ========================================================= */
import { clamp } from '../core/util.js';

export const audio = {
  ctx: null, master: null, muted: false, volume: 0.6,
  init(){
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch(e){}
  },
  setVolume(v){
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  },
  setMuted(m){
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  },
  key(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 1400 + Math.random() * 900;
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.04);
  },
  step(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, 1024, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  beep(freq, dur, vol, type){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  punch(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, 4096, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 700);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
    const o = this.ctx.createOscillator(), g2 = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g2.gain.setValueAtTime(0.4, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2); g2.connect(this.master);
    o.start(t); o.stop(t + 0.32);
  }
};

/* ---------- 全局引用 ---------- */
