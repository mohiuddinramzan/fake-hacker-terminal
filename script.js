(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const out = $('#output');
  const screen = $('#screen');
  const input = $('#cmd');
  const promptRow = $('#prompt');
  const win = $('#window');
  const canvas = $('#matrix');
  const ctx = canvas.getContext('2d');
  const btnSound = $('#btnSound');
  const btnTheme = $('#btnTheme');
  const btnFull = $('#btnFull');

  const THEMES = ['green', 'amber', 'cyan'];
  let theme = 'green';
  let soundOn = false;
  let audio = null;
  let busy = false;
  let cancelled = false;
  let abortWait = null;
  let history = [];
  let hIdx = 0;
  let matrixOn = false;
  let matrixRaf = 0;
  let matrixDone = null;

  class Cancel extends Error {}

  /* ---------- helpers ---------- */
  const wait = (ms) => new Promise((res, rej) => {
    if (cancelled) return rej(new Cancel());
    const id = setTimeout(() => { abortWait = null; res(); }, ms);
    abortWait = () => { clearTimeout(id); abortWait = null; rej(new Cancel()); };
  });

  function print(text, cls) {
    const d = document.createElement('div');
    d.className = 'line' + (cls ? ' ' + cls : '');
    d.textContent = text === '' ? '\u00a0' : text;
    out.appendChild(d);
    scrollDown();
    return d;
  }

  function scrollDown() { screen.scrollTop = screen.scrollHeight; }

  async function lines(list, delay) {
    for (const item of list) {
      const [t, c] = Array.isArray(item) ? item : [item, ''];
      print(t, c);
      await wait(delay);
    }
  }

  function setPrompt(show) {
    promptRow.classList.toggle('hidden', !show);
    if (show) { input.focus({ preventScroll: true }); scrollDown(); }
  }

  function cancelRun() {
    cancelled = true;
    if (matrixOn) stopMatrix();
    if (abortWait) abortWait();
  }

  /* ---------- sound ---------- */
  function beep(freq, dur, vol, type) {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'square';
      o.frequency.value = freq || 800;
      g.gain.setValueAtTime(vol || 0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.04));
      o.connect(g); g.connect(audio.destination);
      o.start(t); o.stop(t + (dur || 0.04) + 0.01);
    } catch (e) { /* audio unavailable */ }
  }

  function setSound(on) {
    soundOn = on;
    btnSound.textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
    if (on) beep(1000, 0.08, 0.05, 'sine');
  }

  /* ---------- theme ---------- */
  function setTheme(name) {
    theme = name;
    document.documentElement.setAttribute('data-theme', name);
    btnTheme.textContent = 'THEME: ' + name.toUpperCase();
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#000000');
  }

  /* ---------- fullscreen ---------- */
  function toggleFullscreen() {
    try {
      const d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        const ex = d.exitFullscreen || d.webkitExitFullscreen;
        if (ex) { const p = ex.call(d); if (p && p.catch) p.catch(() => {}); }
      } else {
        const el = d.documentElement;
        const rq = el.requestFullscreen || el.webkitRequestFullscreen;
        if (rq) { const p = rq.call(el); if (p && p.catch) p.catch(() => {}); }
      }
    } catch (e) { /* unsupported: stay silent */ }
  }

  /* ---------- matrix ---------- */
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZ$#%&*+<>';

  function startMatrix() {
    matrixOn = true;
    win.classList.add('matrix');
    const rect = win.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    const fs = canvas.width < 500 ? 14 : 16;
    const cols = Math.ceil(canvas.width / fs);
    const drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -30));
    const color = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#2dff7a';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fs + 'px monospace';
    let last = 0;
    const frame = (ts) => {
      if (!matrixOn) return;
      matrixRaf = requestAnimationFrame(frame);
      if (ts - last < 45) return;
      last = ts;
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        const x = i * fs, y = drops[i] * fs;
        ctx.fillStyle = '#e8fff0';
        ctx.fillText(ch, x, y);
        ctx.fillStyle = color;
        ctx.fillText(GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)), x, y - fs);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    matrixRaf = requestAnimationFrame(frame);
  }

  function stopMatrix() {
    matrixOn = false;
    cancelAnimationFrame(matrixRaf);
    win.classList.remove('matrix');
    if (matrixDone) { const d = matrixDone; matrixDone = null; d(); }
  }

  canvas.addEventListener('click', () => { if (matrixOn) stopMatrix(); });
  window.addEventListener('resize', () => {
    if (!matrixOn) return;
    cancelAnimationFrame(matrixRaf);
    startMatrix();
  });

  /* ---------- commands ---------- */
  const commands = {
    help() {
      print('AVAILABLE COMMANDS', 'hl big');
      print('');
      const rows = [
        ['help', 'show this list'],
        ['clear', 'clear the terminal (Ctrl+L)'],
        ['about', 'about this simulator'],
        ['status', 'fake system status'],
        ['system', 'fake system information'],
        ['scan', 'fake virtual network scan'],
        ['hack', 'fake hacking animation'],
        ['matrix', 'falling code (ESC to exit)'],
        ['theme', 'theme green | amber | cyan'],
        ['sound', 'sound on | off'],
        ['date', 'show current date'],
        ['time', 'show current time']
      ];
      rows.forEach(([c, d]) => print('  ' + c.padEnd(8) + ' - ' + d));
      print('');
      print('Keys: Enter run | Up/Down history | Esc cancel | Ctrl+L clear', 'dim');
    },

    clear() { out.textContent = ''; },

    about() {
      print('FAKE HACKER TERMINAL SIMULATOR', 'hl big');
      print('Version 1.0 - HTML / CSS / Vanilla JS', 'dim');
      print('');
      print('This website is a fictional terminal simulator created for entertainment.');
      print('');
      print('It does not perform real hacking, network scanning, exploitation,');
      print('or unauthorized access.');
    },

    status() {
      print('SYSTEM STATUS', 'hl big');
      print('CORE ........ ONLINE');
      print('SECURITY .... ACTIVE');
      print('NETWORK ..... SIMULATED');
      print('SESSION ..... LOCAL');
      print('SOUND ....... ' + (soundOn ? 'ON' : 'OFF'));
      print('THEME ....... ' + theme.toUpperCase());
    },

    system() {
      print('SYSTEM INFORMATION (FICTIONAL)', 'hl big');
      print('HOST ........ simulator-01');
      print('OS .......... PHANTOM-OS 9.4 (not real)');
      print('KERNEL ...... 0.0.0-sim');
      print('CPU ......... VIRTUAL CORE x8');
      print('MEMORY ...... 16384 MB (imaginary)');
      print('UPTIME ...... since this page loaded');
      print('USER ........ operator');
    },

    async scan() {
      await lines([
        ['INITIALIZING VIRTUAL SCANNER...', 'hl'], ''
      ], 450);
      await lines(['ANALYZING VIRTUAL NODE...', 'CHECKING PORTS...', 'CHECKING SERVICES...', ''], 700);
      const ports = [
        ['PORT 22    OPEN', 'ok'],
        ['PORT 80    OPEN', 'ok'],
        ['PORT 443   FILTERED', 'warn'],
        ['PORT 8080  CLOSED', 'err']
      ];
      for (const p of ports) { print(p[0], p[1]); beep(700, 0.05, 0.03); await wait(550); }
      print('');
      await wait(400);
      print('SCAN COMPLETE', 'hl big');
      print('');
      print('SIMULATION ENVIRONMENT DETECTED.', 'warn');
      print('NO REAL NETWORK WAS SCANNED.', 'warn');
    },

    async hack() {
      await lines([['STARTING SIMULATION...', 'hl'], ''], 600);
      const bar = print('');
      const W = 20;
      for (let i = 0; i <= 100; i += 2) {
        const n = Math.round((i / 100) * W);
        bar.textContent = '[' + '\u2588'.repeat(n) + '\u2591'.repeat(W - n) + '] ' + i + '%';
        scrollDown();
        if (i % 10 === 0) beep(500 + i * 4, 0.03, 0.025);
        await wait(55);
      }
      print('');
      await lines(['BYPASSING FIREWALL...', 'ANALYZING SECURITY...', 'DECRYPTING DATA...', 'ACCESSING CORE...'], 800);
      print('');
      beep(1200, 0.25, 0.05, 'sine');
      print('ACCESS GRANTED', 'hl big');
      await wait(500);
      print('');
      print('SYSTEM OVERRIDE COMPLETE', 'hl');
      print('');
      print('----------------------------', 'warn');
      print('SIMULATION ONLY', 'warn');
      print('NO REAL SYSTEM WAS ACCESSED', 'warn');
      print('----------------------------', 'warn');
    },

    async matrix() {
      print('ENTERING MATRIX... PRESS ESC (OR TAP) TO EXIT.', 'dim');
      await wait(500);
      await new Promise((res) => { matrixDone = res; startMatrix(); });
      print('MATRIX CLOSED.', 'dim');
    },

    theme(args) {
      const t = (args[0] || '').toLowerCase();
      if (THEMES.includes(t)) {
        setTheme(t);
        print('THEME SET: ' + t.toUpperCase(), 'hl');
      } else {
        print('USAGE: theme green | amber | cyan', 'warn');
        print('CURRENT: ' + theme.toUpperCase(), 'dim');
      }
    },

    sound(args) {
      const a = (args[0] || '').toLowerCase();
      if (a === 'on') setSound(true);
      else if (a === 'off') setSound(false);
      else if (a === '') setSound(!soundOn);
      else { print('USAGE: sound on | off', 'warn'); return; }
      print('SOUND: ' + (soundOn ? 'ON' : 'OFF'), 'hl');
    },

    date() {
      print(new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    },

    time() {
      print(new Date().toLocaleTimeString());
    }
  };

  /* ---------- execution ---------- */
  async function execute(raw) {
    const line = raw.trim();
    print('operator@simulator:~$ ' + raw, 'dim');
    if (!line) return;
    if (history[history.length - 1] !== line) history.push(line);
    hIdx = history.length;
    const parts = line.split(/\s+/);
    const name = parts[0].toLowerCase();
    const fn = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : null;
    if (!fn) {
      print('command not found: ' + parts[0], 'err');
      print('Type "help" for commands.', 'dim');
      return;
    }
    busy = true; cancelled = false;
    setPrompt(false);
    try {
      await fn(parts.slice(1));
    } catch (e) {
      if (e instanceof Cancel) print('^C  ABORTED', 'err');
      else print('ERROR: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      busy = false; cancelled = false; abortWait = null;
      if (matrixOn) stopMatrix();
      setPrompt(true);
    }
  }

  function submit() {
    if (busy) return;
    const v = input.value;
    input.value = '';
    beep(900, 0.05, 0.04);
    execute(v);
  }

  function histPrev() {
    if (busy || !history.length) return;
    if (hIdx > 0) hIdx--;
    input.value = history[hIdx] || '';
    setCaretEnd();
  }

  function histNext() {
    if (busy || !history.length) return;
    if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; }
    else { hIdx = history.length; input.value = ''; }
    setCaretEnd();
  }

  function setCaretEnd() {
    const n = input.value.length;
    try { input.setSelectionRange(n, n); } catch (e) { /* ignore */ }
  }

  /* ---------- events ---------- */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); histPrev(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); histNext(); }
  });

  input.addEventListener('input', () => beep(500 + Math.random() * 300, 0.02, 0.015));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (busy || matrixOn) { e.preventDefault(); cancelRun(); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (!busy) commands.clear();
    }
  });

  screen.addEventListener('click', () => {
    const sel = window.getSelection && window.getSelection().toString();
    if (!sel && !busy) input.focus({ preventScroll: true });
  });

  document.querySelectorAll('.pad button').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const k = b.getAttribute('data-key');
      if (k === 'up') histPrev();
      else if (k === 'down') histNext();
      else if (k === 'enter') submit();
      else if (k === 'esc') { if (busy || matrixOn) cancelRun(); }
      if (!busy) input.focus({ preventScroll: true });
    });
  });

  btnSound.addEventListener('click', () => { setSound(!soundOn); if (!busy) input.focus({ preventScroll: true }); });
  btnTheme.addEventListener('click', () => {
    setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    if (!busy) input.focus({ preventScroll: true });
  });
  btnFull.addEventListener('click', toggleFullscreen);

  /* ---------- boot ---------- */
  async function boot() {
    busy = true; cancelled = false;
    setPrompt(false);
    try {
      await lines([
        'INITIALIZING TERMINAL...',
        'LOADING SYSTEM...',
        'CHECKING MODULES...',
        'SECURITY SYSTEM: READY',
        'VIRTUAL NETWORK: READY',
        'SIMULATION ENGINE: READY',
        ''
      ], 380);
      print('SYSTEM READY.', 'hl big');
      print('');
      print('TYPE "help" FOR COMMANDS.', 'hl');
      print('');
    } catch (e) {
      if (!(e instanceof Cancel)) throw e;
      print('');
      print('SYSTEM READY.', 'hl big');
      print('TYPE "help" FOR COMMANDS.', 'hl');
      print('');
    } finally {
      busy = false; cancelled = false; abortWait = null;
      setPrompt(true);
    }
  }

  setTheme('green');
  setSound(false);
  boot();
})();
