/**
 * AgentX Challenge 2026 - Smart Board Backdrop System
 * Features:
 * - 5 Dynamic Stage Views (Welcome, Countdown, Break, Pitch, Results/Podium)
 * - Web Audio API Synthesizer (Zero asset dependency)
 * - BroadcastChannel & localStorage Two-Way Synchronization
 * - Confetti Canvas Engine for Award Ceremonies
 * - Particle AI Node Network Canvas
 * - Touch-friendly smart board dock & keyboard shortcuts
 */

// Global State
const BackdropState = {
  currentView: 'welcome', // welcome, countdown, break, pitch, results
  resultsSubView: 'leaderboard', // leaderboard, podium
  soundEnabled: true,
  announcement: "Welcome to AgentX Challenge 2026 · AI × CSE × AIFT · SRMIST Tiruchirappalli",
  
  // Hackathon Sprint Timer (6 hours = 21600 seconds)
  hackathonTimer: {
    duration: 6 * 3600,
    remaining: 6 * 3600,
    isRunning: false,
    intervalId: null
  },

  // Break Timer (45 minutes = 2700 seconds)
  breakTimer: {
    duration: 45 * 60,
    remaining: 45 * 60,
    isRunning: false,
    intervalId: null
  },

  // Pitch Timer (Phase 1: Pitch 3m, Phase 2: Demo 2m, Phase 3: Q&A 2m)
  pitchTimer: {
    phases: [
      { name: 'Pitch', duration: 180 },
      { name: 'Live Demo', duration: 120 },
      { name: 'Judge Q&A', duration: 120 }
    ],
    currentPhaseIndex: 0,
    remaining: 180,
    isRunning: false,
    intervalId: null,
    teamName: "Team NeuralForge",
    projectTitle: "Autonomous Clinical Drug-Interaction ReAct Agent"
  },

  // Teams & Results
  teams: [], // filled from the admin CSV upload (agentx_results)

  // Stage Poster Dignitaries & Photo Mode State
  photoMode: false,
  dignitaries: {
    chiefGuest: {
      name: "Shri. Dharun Balaji",
      role: "Industry Jury Member",
      org: "Software & AI Engineer",
      topic: '"The Paradigm Shift: From Chatbot Wrappers to Autonomous Agentic AI Loops"'
    },
    patron: "Dr. N. Malmurugan (Director, SRMIST Trichy)",
    dean: "Dean, Faculty of Engineering & Technology"
  }
};

// Broadcast Channel for Synchronizing Across Tabs / Windows
const broadcastChannel = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('agentx_backdrop_channel') 
  : null;

// ==========================================================================
// 1. Audio Synthesizer (Web Audio API)
// ==========================================================================
class SoundSynth {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type, duration, startTime = 0, volume = 0.2) {
    if (!BackdropState.soundEnabled) return;
    this.init();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
      
      gain.gain.setValueAtTime(volume, this.ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(this.ctx.currentTime + startTime);
      osc.stop(this.ctx.currentTime + startTime + duration);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Pleasant notification chime
  playChime() {
    this.playTone(523.25, 'sine', 0.4, 0, 0.25); // C5
    this.playTone(659.25, 'sine', 0.4, 0.15, 0.25); // E5
    this.playTone(783.99, 'sine', 0.6, 0.3, 0.3); // G5
  }

  // Alert ping (e.g. 5m warning, phase transition)
  playAlert() {
    this.playTone(880, 'triangle', 0.2, 0, 0.3);
    this.playTone(440, 'triangle', 0.4, 0.15, 0.3);
  }

  // Time-up buzzer
  playBuzzer() {
    this.playTone(220, 'sawtooth', 0.3, 0, 0.35);
    this.playTone(200, 'sawtooth', 0.5, 0.2, 0.35);
  }

  // Victory Fanfare for Podium
  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((f, i) => {
      this.playTone(f, 'triangle', 0.5, i * 0.18, 0.3);
    });
  }
}

const synth = new SoundSynth();

// ==========================================================================
// 2. Real-Time Clock
// ==========================================================================
function updateClock() {
  const clockTimeEl = document.getElementById('clock-time');
  const clockDateEl = document.getElementById('clock-date');
  if (!clockTimeEl || !clockDateEl) return;

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  clockDateEl.textContent = now.toLocaleDateString('en-US', options).toUpperCase();
}

// ==========================================================================
// 3. View Switcher
// ==========================================================================
function switchView(viewName, sync = true) {
  BackdropState.currentView = viewName;

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(`view-${viewName}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Update Dock buttons
  document.querySelectorAll('.dock-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update Header Mode Pill
  const modePillText = document.getElementById('mode-pill-text');
  if (modePillText) {
    const labels = {
      welcome: 'Welcome Stage & Inauguration',
      countdown: 'Sprint Countdown',
      break: 'Lunch & Triage',
      pitch: 'Auditorium Finale',
      results: 'Live Results & Podium'
    };
    modePillText.textContent = labels[viewName] || viewName;
  }

  if (viewName === 'results' && BackdropState.resultsSubView === 'podium') {
    startConfetti();
  } else {
    stopConfetti();
  }

  if (sync) syncStateAcross();
}

function switchResultsSubView(subView, sync = true) {
  BackdropState.resultsSubView = subView;
  
  document.querySelectorAll('.results-sub-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));

  const pane = document.getElementById(`res-${subView}`);
  const btn = document.getElementById(`btn-res-${subView}`);
  if (pane) pane.classList.add('active');
  if (btn) btn.classList.add('active');

  if (subView === 'podium') {
    synth.playVictory();
    startConfetti();
  } else {
    stopConfetti();
  }

  if (sync) syncStateAcross();
}

// ==========================================================================
// 4. Hackathon Sprint Timer (6h Countdown)
// ==========================================================================
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateHackathonDisplay() {
  const digitsEl = document.getElementById('sprint-clock-digits');
  const barEl = document.getElementById('sprint-progress-bar');
  const pctEl = document.getElementById('sprint-pct-complete');
  if (!digitsEl) return;

  const rem = BackdropState.hackathonTimer.remaining;
  const dur = BackdropState.hackathonTimer.duration;
  digitsEl.textContent = formatTime(rem);

  // Warning & Critical classes
  digitsEl.classList.remove('warning', 'critical');
  if (rem <= 600 && rem > 0) {
    digitsEl.classList.add('critical');
  } else if (rem <= 1800) {
    digitsEl.classList.add('warning');
  }

  const pct = Math.min(100, Math.max(0, ((dur - rem) / dur) * 100));
  if (barEl) barEl.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;

  updateMilestoneHighlight(rem);
}

function toggleHackathonTimer(forceState = null, sync = true) {
  const t = BackdropState.hackathonTimer;
  const newState = forceState !== null ? forceState : !t.isRunning;
  t.isRunning = newState;

  if (t.isRunning) {
    if (t.intervalId) clearInterval(t.intervalId);
    t.intervalId = setInterval(() => {
      if (t.remaining > 0) {
        t.remaining--;
        // Audio cues at key marks
        if (t.remaining === 1800 || t.remaining === 600 || t.remaining === 300) {
          synth.playAlert();
        } else if (t.remaining === 0) {
          synth.playBuzzer();
        }
        updateHackathonDisplay();
      } else {
        clearInterval(t.intervalId);
        t.isRunning = false;
      }
    }, 1000);
  } else {
    clearInterval(t.intervalId);
  }

  const playPauseBtn = document.getElementById('btn-play-pause-timer');
  if (playPauseBtn) {
    playPauseBtn.textContent = t.isRunning ? '⏸ Pause' : '▶ Start';
  }

  if (sync) syncStateAcross();
}

function adjustHackathonTimer(secondsDelta, sync = true) {
  const t = BackdropState.hackathonTimer;
  t.remaining = Math.max(0, t.remaining + secondsDelta);
  updateHackathonDisplay();
  if (sync) syncStateAcross();
}

function resetHackathonTimer(hours = 6, sync = true) {
  const t = BackdropState.hackathonTimer;
  t.duration = hours * 3600;
  t.remaining = t.duration;
  t.isRunning = false;
  clearInterval(t.intervalId);
  updateHackathonDisplay();
  const playPauseBtn = document.getElementById('btn-play-pause-timer');
  if (playPauseBtn) playPauseBtn.textContent = '▶ Start';
  if (sync) syncStateAcross();
}

function updateMilestoneHighlight(remainingSeconds) {
  // 6h sprint: 09:45 start
  const elapsedMinutes = (BackdropState.hackathonTimer.duration - remainingSeconds) / 60;
  
  // Milestones:
  // -30m (09:15): Inauguration Ceremony (09:15 - 09:45)
  // 0m (09:45): Hackathon Sprint Start
  // 135m (12:00): First Round Submission (Desk Check)
  // 315m (15:00): Second Round Submission & Code Freeze (3:00 PM)
  // 345m (15:30): Jury Judging (Live Demonstration)
  // 405m (16:30): Closing Ceremony & Prize Distribution (16:30 - 17:00)
  const items = [
    { id: 'm-inaug', at: -30 },
    { id: 'm-start', at: 0 },
    { id: 'm-round1', at: 135 },
    { id: 'm-round2', at: 315 },
    { id: 'm-jury', at: 345 },
    { id: 'm-valedictory', at: 405 }
  ];

  items.forEach(m => {
    const el = document.getElementById(m.id);
    if (!el) return;
    el.classList.remove('passed', 'active');
    if (elapsedMinutes >= m.at) {
      el.classList.add('passed');
    } else if (elapsedMinutes >= m.at - 30 && elapsedMinutes < m.at) {
      el.classList.add('active');
    }
  });
}

// ==========================================================================
// 5. Break Timer
// ==========================================================================
function updateBreakDisplay() {
  const el = document.getElementById('break-clock-digits');
  if (!el) return;
  const rem = BackdropState.breakTimer.remaining;
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function toggleBreakTimer(forceState = null, sync = true) {
  const b = BackdropState.breakTimer;
  const newState = forceState !== null ? forceState : !b.isRunning;
  b.isRunning = newState;

  if (b.isRunning) {
    if (b.intervalId) clearInterval(b.intervalId);
    b.intervalId = setInterval(() => {
      if (b.remaining > 0) {
        b.remaining--;
        if (b.remaining === 300 || b.remaining === 60) synth.playAlert();
        if (b.remaining === 0) synth.playBuzzer();
        updateBreakDisplay();
      } else {
        clearInterval(b.intervalId);
        b.isRunning = false;
      }
    }, 1000);
  } else {
    clearInterval(b.intervalId);
  }
  if (sync) syncStateAcross();
}

// ==========================================================================
// 6. Pitch Stage Timer (3m Pitch -> 2m Demo -> 2m Q&A)
// ==========================================================================
function updatePitchDisplay() {
  const p = BackdropState.pitchTimer;
  const clockEl = document.getElementById('pitch-clock');
  const digitsEl = document.getElementById('pitch-clock-digits');
  const phaseBadgeEl = document.getElementById('pitch-phase-badge');
  const teamEl = document.getElementById('pitch-current-team');
  const projEl = document.getElementById('pitch-current-project');
  if (!digitsEl || !clockEl) return;

  const currentPhase = p.phases[p.currentPhaseIndex];
  if (phaseBadgeEl && currentPhase) {
    phaseBadgeEl.textContent = `PHASE: ${currentPhase.name.toUpperCase()} (${Math.floor(currentPhase.duration / 60)} MIN)`;
  }
  if (teamEl) teamEl.textContent = p.teamName;
  if (projEl) projEl.textContent = p.projectTitle;

  const m = Math.floor(p.remaining / 60);
  const s = p.remaining % 60;
  digitsEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  clockEl.classList.remove('warning', 'critical');
  if (p.remaining <= 30 && p.remaining > 0) {
    clockEl.classList.add('critical');
  } else if (p.remaining <= 60) {
    clockEl.classList.add('warning');
  }

  // Update step cards
  document.querySelectorAll('.p-step').forEach((step, idx) => {
    step.classList.toggle('active', idx === p.currentPhaseIndex);
    step.classList.toggle('done', idx < p.currentPhaseIndex);
  });
}

function togglePitchTimer(forceState = null, sync = true) {
  const p = BackdropState.pitchTimer;
  const newState = forceState !== null ? forceState : !p.isRunning;
  p.isRunning = newState;

  if (p.isRunning) {
    if (p.intervalId) clearInterval(p.intervalId);
    p.intervalId = setInterval(() => {
      if (p.remaining > 0) {
        p.remaining--;
        if (p.remaining === 30) synth.playAlert();
        updatePitchDisplay();
      } else {
        synth.playBuzzer();
        // Advance phase or stop
        if (p.currentPhaseIndex < p.phases.length - 1) {
          p.currentPhaseIndex++;
          p.remaining = p.phases[p.currentPhaseIndex].duration;
          synth.playChime();
          updatePitchDisplay();
        } else {
          clearInterval(p.intervalId);
          p.isRunning = false;
        }
      }
    }, 1000);
  } else {
    clearInterval(p.intervalId);
  }

  if (sync) syncStateAcross();
}

function setPitchPhase(phaseIndex, sync = true) {
  const p = BackdropState.pitchTimer;
  p.currentPhaseIndex = phaseIndex;
  p.remaining = p.phases[phaseIndex].duration;
  p.isRunning = false;
  clearInterval(p.intervalId);
  updatePitchDisplay();
  if (sync) syncStateAcross();
}

// ==========================================================================
// 7. Leaderboard & Results Table Renderer
// ==========================================================================
function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  if (!tbody) return;

  // Highest score first; ties keep upload order
  const sorted = [...BackdropState.teams].sort((a, b) => (b.score ?? b.finale ?? 0) - (a.score ?? a.finale ?? 0));

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-dim)">Results will appear here once published from the admin console.</td></tr>';
  } else tbody.innerHTML = sorted.map((t, idx) => {
    const rank = idx + 1;
    const rankBadgeClass = rank <= 3 ? `rank-${rank}` : '';
    const medal = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
    const score = t.score ?? t.finale ?? 0;
    return `
      <tr>
        <td style="width: 70px;">
          <span class="rank-badge ${rankBadgeClass}">${rank}</span>
        </td>
        <td class="team-cell">
          <b>${medal}${escapeHtml(t.name)}</b>
          <span>${escapeHtml(t.project || '')}${t.wrapper ? ' · wrapper cap' : ''}</span>
        </td>
        <td><span class="status-tag ${/^pass$/i.test(t.round1) ? 'pass' : 'probation'}">${escapeHtml(t.round1 || '—')}</span></td>
        <td><span class="score-num" style="color: var(--accent-cyan);">${t.round2 ?? '—'}</span></td>
        <td><span class="score-num">${t.hygiene ?? '—'}</span></td>
        <td><span class="score-num" style="color: var(--primary);">${score}</span></td>
      </tr>
    `;
  }).join('');

  // Update Podium Cards
  updatePodiumSlot('gold', sorted[0]);
  updatePodiumSlot('silver', sorted[1]);
  updatePodiumSlot('bronze', sorted[2]);
}

function updatePodiumSlot(tier, team) {
  const nameEl = document.getElementById(`podium-${tier}-name`);
  const projEl = document.getElementById(`podium-${tier}-project`);
  const scoreEl = document.getElementById(`podium-${tier}-score`);
  if (nameEl) nameEl.textContent = team ? team.name : "TBA";
  if (projEl) projEl.textContent = team ? team.project : "Awaiting results";
  if (scoreEl) scoreEl.textContent = team ? `Score: ${team.score ?? team.finale}/70` : "—";
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================================================
// 8. Confetti Animation Engine
// ==========================================================================
let confettiAnimId = null;
let confettiParticles = [];

function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  confettiParticles = [];
  const colors = ['#b6f23a', '#f59e0b', '#06b6d4', '#ec4899', '#ffffff', '#a855f7'];

  for (let i = 0; i < 160; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 5
    });
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRot;

      if (p.y > canvas.height) {
        p.y = -10;
        p.x = Math.random() * canvas.width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
      ctx.restore();
    });

    confettiAnimId = requestAnimationFrame(render);
  }

  cancelAnimationFrame(confettiAnimId);
  render();
}

function stopConfetti() {
  cancelAnimationFrame(confettiAnimId);
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ==========================================================================
// 9. Node Network Canvas Background
// ==========================================================================
function initBackgroundNetwork() {
  const canvas = document.getElementById('backdrop-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const count = Math.min(Math.floor(width / 16), 80);

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      radius: Math.random() * 2 + 1,
      color: Math.random() > 0.5 ? 'rgba(182, 242, 58, 0.35)' : 'rgba(6, 182, 212, 0.25)'
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(182, 242, 58, ${0.1 * (1 - dist / 130)})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// ==========================================================================
// 10. Announcement Marquee & Modal Handler
// ==========================================================================
function setAnnouncement(text, sync = true) {
  BackdropState.announcement = text;
  const marqueeEl = document.getElementById('ticker-text');
  if (marqueeEl) {
    marqueeEl.textContent = text;
    // Reset animation
    marqueeEl.style.animation = 'none';
    marqueeEl.offsetHeight; // trigger reflow
    marqueeEl.style.animation = 'marquee 25s linear infinite';
  }
  synth.playChime();
  if (sync) syncStateAcross();
}

function openAnnouncementModal() {
  const modal = document.getElementById('announcement-modal');
  if (modal) {
    modal.classList.add('active');
    const input = document.getElementById('modal-announcement-input');
    if (input) {
      input.value = BackdropState.announcement;
      input.focus();
    }
  }
}

function closeAnnouncementModal() {
  const modal = document.getElementById('announcement-modal');
  if (modal) modal.classList.remove('active');
}

// ==========================================================================
// 11. Fullscreen & Keyboard Controls
// ==========================================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn("Fullscreen error:", err);
    });
  } else {
    document.exitFullscreen().catch(err => {
      console.warn("Exit fullscreen error:", err);
    });
  }
}

function toggleSound() {
  BackdropState.soundEnabled = !BackdropState.soundEnabled;
  synth.init();
  const badge = document.getElementById('sound-toggle-badge');
  if (badge) {
    badge.innerHTML = BackdropState.soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: MUTED';
    badge.classList.toggle('active', BackdropState.soundEnabled);
  }
  if (BackdropState.soundEnabled) synth.playChime();
}

function togglePhotoMode(force = null, sync = true) {
  const isPhoto = force !== null ? force : !document.body.classList.contains('clean-photo-mode');
  BackdropState.photoMode = isPhoto;
  document.body.classList.toggle('clean-photo-mode', isPhoto);
  
  if (isPhoto) {
    switchView('welcome', false);
  }

  const photoBtn = document.getElementById('dock-photo-btn');
  if (photoBtn) {
    photoBtn.classList.toggle('active', isPhoto);
  }

  if (sync) syncStateAcross();
}

function renderDignitaries() {
  const d = BackdropState.dignitaries;
  if (!d) return;
  const nameEl = document.getElementById('poster-cg-name');
  const roleEl = document.getElementById('poster-cg-role');
  const orgEl = document.getElementById('poster-cg-org');
  const topicEl = document.getElementById('poster-cg-topic');
  const patronEl = document.getElementById('poster-patron-name');
  const deanEl = document.getElementById('poster-dean-name');

  if (nameEl && d.chiefGuest) nameEl.textContent = d.chiefGuest.name;
  if (roleEl && d.chiefGuest) roleEl.textContent = d.chiefGuest.role;
  if (orgEl && d.chiefGuest) orgEl.textContent = d.chiefGuest.org;
  if (topicEl && d.chiefGuest) topicEl.textContent = d.chiefGuest.topic;
  if (patronEl) patronEl.textContent = d.patron;
  if (deanEl) deanEl.textContent = d.dean;
}

function handleKeydown(e) {
  // If typing in input, ignore global shortcuts
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') closeAnnouncementModal();
    return;
  }

  switch (e.key) {
    case '1':
      switchView('welcome');
      break;
    case '2':
      switchView('countdown');
      break;
    case '3':
      switchView('break');
      break;
    case '4':
      switchView('results');
      break;
    case ' ':
      e.preventDefault();
      if (BackdropState.currentView === 'countdown') {
        toggleHackathonTimer();
      } else if (BackdropState.currentView === 'pitch') {
        togglePitchTimer();
      } else if (BackdropState.currentView === 'break') {
        toggleBreakTimer();
      }
      break;
    case 'p':
    case 'P':
      togglePhotoMode();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case 'm':
    case 'M':
      toggleSound();
      break;
    case 't':
    case 'T':
      openAnnouncementModal();
      break;
    case 'Escape':
      if (document.body.classList.contains('clean-photo-mode')) {
        togglePhotoMode(false);
      } else {
        closeAnnouncementModal();
      }
      break;
  }
}

// ==========================================================================
// 12. Cross-Window Synchronization (BroadcastChannel + LocalStorage)
// ==========================================================================
function syncStateAcross() {
  const payload = {
    type: 'STATE_UPDATE',
    currentView: BackdropState.currentView,
    resultsSubView: BackdropState.resultsSubView,
    soundEnabled: BackdropState.soundEnabled,
    announcement: BackdropState.announcement,
    photoMode: BackdropState.photoMode,
    dignitaries: BackdropState.dignitaries,
    hackathonTimer: {
      remaining: BackdropState.hackathonTimer.remaining,
      duration: BackdropState.hackathonTimer.duration,
      isRunning: BackdropState.hackathonTimer.isRunning
    },
    breakTimer: {
      remaining: BackdropState.breakTimer.remaining,
      isRunning: BackdropState.breakTimer.isRunning
    },
    pitchTimer: {
      remaining: BackdropState.pitchTimer.remaining,
      currentPhaseIndex: BackdropState.pitchTimer.currentPhaseIndex,
      isRunning: BackdropState.pitchTimer.isRunning,
      teamName: BackdropState.pitchTimer.teamName,
      projectTitle: BackdropState.pitchTimer.projectTitle
    },
    teams: BackdropState.teams,
    timestamp: Date.now()
  };

  if (broadcastChannel) {
    broadcastChannel.postMessage(payload);
  }
  try {
    localStorage.setItem('agentx_backdrop_state', JSON.stringify(payload));
  } catch (e) {
    // Ignore quota errors
  }
}

function handleIncomingState(data) {
  if (!data || data.type !== 'STATE_UPDATE') return;

  if (data.currentView && data.currentView !== BackdropState.currentView) {
    switchView(data.currentView, false);
  }

  if (data.resultsSubView && data.resultsSubView !== BackdropState.resultsSubView) {
    switchResultsSubView(data.resultsSubView, false);
  }

  if (typeof data.photoMode === 'boolean') {
    togglePhotoMode(data.photoMode, false);
  }

  if (data.dignitaries) {
    BackdropState.dignitaries = { ...BackdropState.dignitaries, ...data.dignitaries };
    renderDignitaries();
  }

  if (data.announcement && data.announcement !== BackdropState.announcement) {
    setAnnouncement(data.announcement, false);
  }

  if (data.hackathonTimer) {
    BackdropState.hackathonTimer.remaining = data.hackathonTimer.remaining;
    if (data.hackathonTimer.isRunning !== BackdropState.hackathonTimer.isRunning) {
      toggleHackathonTimer(data.hackathonTimer.isRunning, false);
    }
    updateHackathonDisplay();
  }

  if (data.breakTimer) {
    BackdropState.breakTimer.remaining = data.breakTimer.remaining;
    if (data.breakTimer.isRunning !== BackdropState.breakTimer.isRunning) {
      toggleBreakTimer(data.breakTimer.isRunning, false);
    }
    updateBreakDisplay();
  }

  if (data.pitchTimer) {
    BackdropState.pitchTimer.remaining = data.pitchTimer.remaining;
    BackdropState.pitchTimer.currentPhaseIndex = data.pitchTimer.currentPhaseIndex;
    BackdropState.pitchTimer.teamName = data.pitchTimer.teamName;
    BackdropState.pitchTimer.projectTitle = data.pitchTimer.projectTitle;
    if (data.pitchTimer.isRunning !== BackdropState.pitchTimer.isRunning) {
      togglePitchTimer(data.pitchTimer.isRunning, false);
    }
    updatePitchDisplay();
  }

  if (data.teams) {
    BackdropState.teams = data.teams;
    renderLeaderboard();
  }
}

// Listen to BroadcastChannel & LocalStorage
if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    handleIncomingState(event.data);
  };
}

window.addEventListener('storage', (e) => {
  if (e.key === 'agentx_results' && e.newValue) {
    try {
      BackdropState.teams = JSON.parse(e.newValue);
      renderLeaderboard();
    } catch (err) {}
  }
  if (e.key === 'agentx_backdrop_state' && e.newValue) {
    try {
      handleIncomingState(JSON.parse(e.newValue));
    } catch (err) {
      console.error("Storage sync parse error:", err);
    }
  }
});

// ==========================================================================
// 13. Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Load saved state from localStorage if available
  try {
    const saved = localStorage.getItem('agentx_backdrop_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      const res = localStorage.getItem('agentx_results');
      if (res) BackdropState.teams = JSON.parse(res);
      if (parsed.announcement) BackdropState.announcement = parsed.announcement;
    }
  } catch (e) {
    console.warn("Storage read error:", e);
  }

  // Setup Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Setup Canvases
  initBackgroundNetwork();

  // Setup Initial Displays
  updateHackathonDisplay();
  updateBreakDisplay();
  updatePitchDisplay();
  renderLeaderboard();
  renderDignitaries();
  setAnnouncement(BackdropState.announcement, false);
  const urlParams = new URLSearchParams(window.location.search);
  const initialView = urlParams.get('view') || 'welcome';
  switchView(initialView, false);

  // Setup Event Listeners
  window.addEventListener('keydown', handleKeydown);

  // Dock Buttons
  document.querySelectorAll('.dock-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  const photoDockBtn = document.getElementById('dock-photo-btn');
  if (photoDockBtn) {
    photoDockBtn.addEventListener('click', () => togglePhotoMode());
  }

  const photoModeHint = document.getElementById('photo-mode-hint');
  if (photoModeHint) {
    photoModeHint.addEventListener('click', () => togglePhotoMode(false));
  }

  const dockTrigger = document.querySelector('.dock-trigger');
  const smartDock = document.querySelector('.smart-dock');
  if (dockTrigger && smartDock) {
    dockTrigger.addEventListener('click', () => {
      smartDock.classList.toggle('open');
    });
  }

  // Action Buttons
  const btnPlayPause = document.getElementById('btn-play-pause-timer');
  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => toggleHackathonTimer());
  }

  const btnResetTimer = document.getElementById('btn-reset-timer');
  if (btnResetTimer) {
    btnResetTimer.addEventListener('click', () => resetHackathonTimer(6));
  }

  const btnPlus5 = document.getElementById('btn-plus-5m');
  if (btnPlus5) {
    btnPlus5.addEventListener('click', () => adjustHackathonTimer(300));
  }

  const btnMinus5 = document.getElementById('btn-minus-5m');
  if (btnMinus5) {
    btnMinus5.addEventListener('click', () => adjustHackathonTimer(-300));
  }

  // Pitch buttons
  const btnPlayPitch = document.getElementById('btn-pitch-play-pause');
  if (btnPlayPitch) {
    btnPlayPitch.addEventListener('click', () => togglePitchTimer());
  }

  document.querySelectorAll('.p-step[data-phase]').forEach(step => {
    step.addEventListener('click', () => {
      setPitchPhase(parseInt(step.dataset.phase, 10));
    });
  });

  // Results sub-view buttons
  const btnResLb = document.getElementById('btn-res-leaderboard');
  const btnResPodium = document.getElementById('btn-res-podium');
  if (btnResLb) btnResLb.addEventListener('click', () => switchResultsSubView('leaderboard'));
  if (btnResPodium) btnResPodium.addEventListener('click', () => switchResultsSubView('podium'));

  // Announcement Modal
  const btnDockAnnounce = document.getElementById('dock-announce-btn');
  if (btnDockAnnounce) btnDockAnnounce.addEventListener('click', openAnnouncementModal);

  const btnCloseModal = document.getElementById('btn-close-modal');
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeAnnouncementModal);

  const btnSaveModal = document.getElementById('btn-save-announcement');
  if (btnSaveModal) {
    btnSaveModal.addEventListener('click', () => {
      const input = document.getElementById('modal-announcement-input');
      if (input && input.value.trim()) {
        setAnnouncement(input.value.trim());
      }
      closeAnnouncementModal();
    });
  }

  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('modal-announcement-input');
      if (input) input.value = chip.dataset.text;
    });
  });

  const soundBadge = document.getElementById('sound-toggle-badge');
  if (soundBadge) {
    soundBadge.addEventListener('click', toggleSound);
  }

  const fsBtn = document.getElementById('dock-fullscreen-btn');
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleFullscreen);
  }

  // Audio on first user interaction
  document.addEventListener('click', () => synth.init(), { once: true });
});
