/*!
 * video-preview-player v0.1.0
 * ------------------------------------------------------------------
 * A muted, autoplay, custom-skinned video preview player.
 *
 * Provider-agnostic core: a "provider" abstracts a video backend.
 * YouTube ships built-in. Vimeo, hosted MP4, Twitch, etc. can be
 * added by implementing the same tiny interface (see the Provider
 * section below) and registering it:
 *
 *     VideoPreviewPlayer.registerProvider('vimeo', VimeoProvider);
 *
 * No dependencies. Works from a plain <script> tag or as a module.
 *
 * MIT License
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.VideoPreviewPlayer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==============================================================
   * Provider interface (implement these to add a video outlet)
   * ==============================================================
   * A provider is a CLASS created with `new Provider(slot, options)`
   * that injects its media into `slot` (a positioned <div>).
   *
   * Required methods:
   *   onReady(cb)            register a callback fired when the media
   *                          element is ready to play
   *   onStateChange(cb)      cb(state) where state is one of the
   *                          PROVIDER_STATE constants below
   *   play(), pause()        transport control
   *   mute(), unmute()       audio control
   *   getVolume() -> number (0-100), setVolume(0-100)
   *   seekTo(seconds)        seek (best-effort)
   *   isMuted() -> boolean
   *   isPlaying() -> boolean
   *   getState() -> number   (optional; raw provider state, e.g. to tell buffering from paused)
   *   getCurrentTime() -> number (seconds)
   *   getDuration() -> number (seconds)
   *   destroy()              tear the media element down
   * ============================================================== */

  var PROVIDER_STATE = {
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    READY: 5,
  };

  var providers = {};

  /* --------------------------------------------------------------
   * YouTube provider (uses the official IFrame Player API)
   * ------------------------------------------------------------ */
  var ytApiPromise = null;
  var YT_FALLBACK_HOST = 'https://www.youtube.com';

  // Loads the IFrame Player API, preferring `preferredHost` (privacy-friendly
  // youtube-nocookie.com) but falling back to youtube.com if the preferred
  // host is blocked / unreachable (some corporate filters and ad-blockers
  // block the nocookie domain). Resolves with { YT, host }.
  function loadYouTubeApi(preferredHost) {
    if (!ytApiPromise) {
      ytApiPromise = new Promise(function (resolve, reject) {
        var tried = [];

        function tryHost(host) {
          if (tried.indexOf(host) !== -1) { reject(new Error('YouTube API unavailable')); return; }
          tried.push(host);

          var prev = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = function () {
            if (typeof prev === 'function') prev();
            resolve({ YT: window.YT, host: host });
          };

          var s = document.createElement('script');
          s.src = host + '/iframe_api';
          var settled = false;
          var fallback = function () {
            if (settled) return;
            settled = true;
            tryHost(preferredHost === 'https://www.youtube-nocookie.com'
              ? YT_FALLBACK_HOST
              : YT_FALLBACK_HOST);
          };
          s.onerror = fallback;
          setTimeout(fallback, 8000); // never hang the player on a dead host
          document.head.appendChild(s);
        }

        tryHost(preferredHost);
      });
    }
    return ytApiPromise;
  }

  function YouTubeProvider(slot, options) {
    this.slot = slot;
    this.options = options;
    this._readyCbs = [];
    this._stateCbs = [];
    this._player = null;
    this._destroyed = false;
    this._load();
  }

  YouTubeProvider.prototype._load = function () {
    var self = this;
    var o = this.options;
    var preferredHost = o.privacyMode ? 'https://www.youtube-nocookie.com' : YT_FALLBACK_HOST;

    loadYouTubeApi(preferredHost).then(function (res) {
      if (self._destroyed) return;

      var playerVars = {
        rel: 0,                     // no related videos
        controls: 0,                // hide native controls (we skin them)
        modestbranding: 1,
        playsinline: 1,
        cc_load_policy: 0,
        fs: 0,
        disablekb: 1,
        autoplay: o.autoPlay ? 1 : 0,
        mute: o.muted !== false ? 1 : 0,
        loop: o.loop ? 1 : 0,
      };
      // Merge caller-provided overrides last so they win.
      for (var k in (o.playerVars || {})) playerVars[k] = o.playerVars[k];

      // YouTube only honors loop=1 when a playlist is supplied.
      if (playerVars.loop && !playerVars.playlist) playerVars.playlist = o.videoId;

      // YT.Player replaces the element it's given with the <iframe> (preserving
      // its attributes/inline style). Give it a holder inside the slot so the
      // iframe always lands inside `.vpp-slot`, sized to fill it.
      var holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
      self.slot.appendChild(holder);

      self._player = new res.YT.Player(holder, {
        host: res.host,
        videoId: o.videoId,
        playerVars: playerVars,
        events: {
          onReady: function () { self._readyCbs.forEach(function (cb) { cb(); }); },
          onStateChange: function (e) { self._stateCbs.forEach(function (cb) { cb(e.data); }); },
        },
      });
    });
  };

  YouTubeProvider.prototype.onReady = function (cb) { this._readyCbs.push(cb); };
  YouTubeProvider.prototype.onStateChange = function (cb) { this._stateCbs.push(cb); };
  YouTubeProvider.prototype.play = function () { if (this._player) this._player.playVideo(); };
  YouTubeProvider.prototype.pause = function () { if (this._player) this._player.pauseVideo(); };
  YouTubeProvider.prototype.mute = function () { if (this._player) this._player.mute(); };
  YouTubeProvider.prototype.unmute = function () { if (this._player) this._player.unMute(); };
  YouTubeProvider.prototype.getVolume = function () { return this._player ? this._player.getVolume() : 100; };
  YouTubeProvider.prototype.setVolume = function (v) { if (this._player) this._player.setVolume(v); };
  YouTubeProvider.prototype.seekTo = function (t) { if (this._player) this._player.seekTo(t, true); };
  YouTubeProvider.prototype.isMuted = function () {
    return this._player ? this._player.isMuted() : this.options.muted !== false;
  };
  YouTubeProvider.prototype.isPlaying = function () {
    return this._player ? this._player.getPlayerState() === PROVIDER_STATE.PLAYING : false;
  };
  YouTubeProvider.prototype.getState = function () {
    return this._player ? this._player.getPlayerState() : PROVIDER_STATE.PAUSED;
  };
  YouTubeProvider.prototype.getCurrentTime = function () {
    return this._player ? this._player.getCurrentTime() : 0;
  };
  YouTubeProvider.prototype.getDuration = function () {
    return this._player ? this._player.getDuration() : 0;
  };
  YouTubeProvider.prototype.destroy = function () {
    this._destroyed = true;
    if (this._player) this._player.destroy();
    this._player = null;
  };

  providers.youtube = YouTubeProvider;

  /* --------------------------------------------------------------
   * Lottie play-button animation (optional, no hard dependency)
   * ------------------------------------------------------------ */
  var lottiePromise = null;

  function loadLottie() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (!lottiePromise) {
      lottiePromise = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5/build/player/lottie.min.js';
        s.onload = function () { resolve(window.lottie || null); };
        s.onerror = function () { resolve(null); }; // non-fatal: CSS bars remain
        document.head.appendChild(s);
      });
    }
    return lottiePromise;
  }

  // Lottie colors are [r, g, b, a] with 0-1 components.
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }

  // Pre-click backdrop color: named presets or a raw CSS color.
  function resolveBackdrop(mode) {
    if (mode === 'dark') return '#000000';
    if (mode === 'light') return '#ffffff';
    if (mode === 'none') return 'transparent';
    return mode || '#000000';
  }

  // Relative luminance of a hex color (WCAG-style).
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    var lin = function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  // Pick a button color that reads on the backdrop: white on dark, dark on light.
  function contrastColor(hex) {
    var L = luminance(hex);
    return (L === null || L > 0.4) ? '#112d4e' : '#ffffff';
  }

  /* ==============================================================
   * Core player
   * ============================================================== */

  var DEFAULTS = {
    provider: 'youtube',
    videoId: null,
    autoPlay: true,
    loop: true,
    muted: true,
    privacyMode: true,            // use youtube-nocookie.com when possible
    playerVars: null,

    // Skin copy
    textPaused: 'Paused',
    textEnded: 'Ended',
    unmuteText: '',                 // shown while playing muted (empty = hidden)
    unmuteTextSecondary: '',        // e.g. 'Click For Sound'

    // Skin colors
    colorBars: '#3f72af',
    colorPlayButton: '#3f72af',
    colorProgressBarTotal: 'rgba(255,255,255,0.65)',
    colorProgressBar: '#112d4e',

    // Pre-click backdrop & dismiss transition
    backdrop: 'dark',             // 'dark' | 'light' | 'none' | any CSS color — scrim behind the play button
    backdropOpacity: 0.4,         // 0-1 scrim strength
    backdropTransition: 'ripple', // 'fade' | 'ripple' | 'zoom' | 'slide-up' | 'blur'

    // Behavior
    controlsHideDelay: 2500,      // ms of inactivity before the bar auto-hides (while playing)

    // Lottie play-button animation (default on; falls back to CSS sound bars)
    lottieFileUrl: 'https://cdn.jsdelivr.net/gh/watanabefam/video-preview-player@main/lottie/play-button.json',
    lottieLoop: true,
    lottieAutoplay: true,
    lottieColors: null,           // [hex, hex, ...] recolors animation layers in order
    lottieSize: 120,              // px

    // Watermark
    watermarkTextContent: '',
    watermarkImageUrl: '',
    watermarkTextColor: '#ffffff',
    watermarkTransparency: 0,     // 0-100
    watermarkSize: 150,
    watermarkPosition: 'right-top', // left-top | right-top | left-bottom | right-bottom | center
    watermarkTiming: 'always',    // 'always' | 'before' | 'after' | 'none' (off)
  };

  function VideoPreviewPlayer(options) {
    if (!options || !options.videoId) {
      throw new Error('VideoPreviewPlayer: options.videoId is required.');
    }
    this.options = merge(DEFAULTS, options);
    this.target = resolveTarget(options.target);
    if (!this.target) throw new Error('VideoPreviewPlayer: options.target must resolve to an element.');

    var Klass = providers[this.options.provider];
    if (!Klass) {
      throw new Error(
        'VideoPreviewPlayer: unknown provider "' + this.options.provider + '". ' +
        'Registered: ' + Object.keys(providers).join(', ')
      );
    }

    this._ended = false;
    this._unmuted = false;
    this._interacted = false;       // HUD stays hidden until the first click
    this._startingPlay = false;     // suppresses the paused UI during play-start
    this._startTimer = null;
    this._hideTimer = null;
    this._volumeDragging = false;
    this._lottieAnim = null;
    this._initDom();
    this._syncWatermark();
    if (this.options.autoPlay) this._beginPlayStart();
    this._provider = new Klass(this.slot, this.options);
    this._wireProvider();
    this._startTicker();
    if (this.options.lottieFileUrl) this._setupLottie();
  }

  /* ----- static API ----- */
  VideoPreviewPlayer.registerProvider = function (name, Klass) {
    providers[name] = Klass;
  };

  /* ----- DOM ----- */
  VideoPreviewPlayer.prototype._initDom = function () {
    var o = this.options;
    var root = document.createElement('div');
    // Start with the control bar hidden: no HUD until the user clicks.
    root.className = 'vpp-root vpp-controls-hidden';
    root.style.setProperty('--vpp-bars', o.colorBars);
    root.style.setProperty('--vpp-play-button', o.colorPlayButton);
    root.style.setProperty('--vpp-progress-total', o.colorProgressBarTotal);
    root.style.setProperty('--vpp-progress', o.colorProgressBar);
    root.setAttribute('data-transition', o.backdropTransition);
    root.style.setProperty('--vpp-backdrop', resolveBackdrop(o.backdrop));
    root.style.setProperty('--vpp-backdrop-opacity', String(o.backdropOpacity));

    var slot = document.createElement('div');
    slot.className = 'vpp-slot';

    var overlay = document.createElement('div');
    overlay.className = 'vpp-overlay';
    overlay.innerHTML =
      '<div class="vpp-backdrop"></div>' +
      '<div class="vpp-overlay-inner">' +
      '  <div class="vpp-lottie"></div>' +
      '  <span class="vpp-sound-bars" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '  <span class="vpp-sound-bars vpp-sound-bars--big" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '  <span class="vpp-text-primary"></span>' +
      '  <span class="vpp-text-secondary"></span>' +
      '</div>';

    var controls = document.createElement('div');
    controls.className = 'vpp-controls';
    controls.innerHTML =
      '<button type="button" class="vpp-play-toggle" aria-label="Play / Pause">' +
      '  <svg class="vpp-ico vpp-ico-play" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' +
      '  <svg class="vpp-ico vpp-ico-pause" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>' +
      '</button>' +
      '<div class="vpp-progress" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '  <div class="vpp-progress-fill"></div>' +
      '</div>' +
      '<span class="vpp-time">0:00</span>' +
      '<div class="vpp-volume">' +
      '  <button type="button" class="vpp-mute-toggle" aria-label="Mute">' +
      '    <svg class="vpp-ico vpp-ico-unmuted" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>' +
      '    <svg class="vpp-ico vpp-ico-muted" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>' +
      '  </button>' +
      '  <input type="range" class="vpp-volume-slider" min="0" max="100" step="5" value="100" aria-label="Volume" />' +
      '</div>';

    var watermark = document.createElement('div');
    watermark.className = 'vpp-watermark vpp-watermark--' + o.watermarkPosition;
    watermark.style.fontSize = o.watermarkSize + 'px';
    watermark.style.opacity = (100 - o.watermarkTransparency) / 100;
    if (o.watermarkImageUrl) {
      var img = document.createElement('img');
      img.src = o.watermarkImageUrl;
      img.alt = '';
      watermark.appendChild(img);
      watermark.style.width = o.watermarkSize + 'px';
    } else {
      watermark.textContent = o.watermarkTextContent;
      watermark.style.color = o.watermarkTextColor;
    }

    root.appendChild(slot);
    root.appendChild(overlay);
    root.appendChild(controls);
    if (o.watermarkTextContent || o.watermarkImageUrl) root.appendChild(watermark);
    this.target.appendChild(root);

    this.root = root;
    this.slot = slot;
    this.overlay = overlay;
    this.overlayInner = overlay.querySelector('.vpp-overlay-inner');
    this.textPrimary = overlay.querySelector('.vpp-text-primary');
    this.textSecondary = overlay.querySelector('.vpp-text-secondary');
    this.soundBars = overlay.querySelector('.vpp-sound-bars');
    this.lottieEl = overlay.querySelector('.vpp-lottie');
    this.controls = controls;
    this.playToggle = controls.querySelector('.vpp-play-toggle');
    this.progress = controls.querySelector('.vpp-progress');
    this.progressFill = controls.querySelector('.vpp-progress-fill');
    this.timeEl = controls.querySelector('.vpp-time');
    this.muteToggle = controls.querySelector('.vpp-mute-toggle');
    this.volumeSlider = controls.querySelector('.vpp-volume-slider');
    this.watermark = watermark;

    this._bindEvents();
  };

  VideoPreviewPlayer.prototype._bindEvents = function () {
    var self = this;

    // Overlay: clicking the video always replays from the start, with sound.
    this.overlay.addEventListener('click', function (e) {
      self._interacted = true; // first click unlocks the HUD
      self._playFromStart(e);
    });

    // Play / pause toggle on the bottom bar
    this.playToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      self._interacted = true;
      if (self._provider.isPlaying()) self._provider.pause();
      else self._playFromStart();
    });

    // Seek on the progress bar (click + drag)
    var seeking = false;
    var seekFromEvent = function (e) {
      var rect = self.progress.getBoundingClientRect();
      var frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      var d = self._provider.getDuration() || 0;
      self._provider.seekTo(frac * d);
      self._renderProgress(frac);
    };
    this.progress.addEventListener('pointerdown', function (e) {
      self._interacted = true;
      seeking = true;
      self.progress.setPointerCapture(e.pointerId);
      seekFromEvent(e);
    });
    this.progress.addEventListener('pointermove', function (e) {
      if (seeking) seekFromEvent(e);
    });
    this.progress.addEventListener('pointerup', function () { seeking = false; });
    this.progress.addEventListener('pointercancel', function () { seeking = false; });

    // Mute toggle
    this.muteToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      self._interacted = true;
      if (self._provider.isMuted()) {
        // Unmuting while the slider is at 0 is pointless — give it some sound.
        if (+self.volumeSlider.value === 0) { self._provider.setVolume(100); self.volumeSlider.value = 100; }
        self._provider.unmute();
      } else {
        self._provider.mute();
      }
      self._renderState();
    });

    // Volume slider
    this.volumeSlider.addEventListener('pointerdown', function () { self._interacted = true; self._volumeDragging = true; });
    this.volumeSlider.addEventListener('input', function () {
      var v = +self.volumeSlider.value;
      self._provider.setVolume(v);
      if (v > 0 && self._provider.isMuted()) self._provider.unmute();
      self._renderState();
    });
    this.volumeSlider.addEventListener('change', function () { self._volumeDragging = false; });
    this.volumeSlider.addEventListener('pointerup', function () { self._volumeDragging = false; });

    // Auto-hide the control bar after a few seconds of inactivity (while playing)
    this.root.addEventListener('mousemove', function () {
      self._showControls();
      self._scheduleHide();
    });
    this.root.addEventListener('touchstart', function () {
      self._showControls();
      self._scheduleHide();
    }, { passive: true });
    this.controls.addEventListener('mouseenter', function () {
      self._cancelHide();
      self._showControls();
    });
    this.controls.addEventListener('mouseleave', function () {
      if (self._provider.isPlaying()) self._scheduleHide();
    });
  };

  /* ----- provider wiring ----- */
  VideoPreviewPlayer.prototype._wireProvider = function () {
    var self = this;
    this._provider.onReady(function () {
      self._renderState();
      if (self._provider.isPlaying()) self._scheduleHide();
    });
    this._provider.onStateChange(function (state) {
      if (state === PROVIDER_STATE.PLAYING) {
        self._ended = false;
        self._startingPlay = false; // play actually started
        self._scheduleHide();
      } else if (state === PROVIDER_STATE.ENDED) {
        self._ended = !self.options.loop;
        self._showControls();
      } else if (state === PROVIDER_STATE.PAUSED) {
        self._showControls();
      }
      self._renderState();
    });
  };

  VideoPreviewPlayer.prototype._unmute = function (e) {
    this._unmuted = true;
    this._provider.unmute();
    if (!this._provider.isPlaying()) this._provider.play();
    var self = this;
    if (this.options.backdropTransition === 'ripple' && !this.overlay.classList.contains('vpp-overlay--hidden')) {
      // Material-style ripple from the click point, then fade the overlay.
      this._rippleOut(e);
      setTimeout(function () { self.overlay.classList.add('vpp-overlay--hidden'); }, 240);
      setTimeout(function () { self._renderState(); }, 300);
    } else {
      this._renderState();
      // Re-render once the transition has completed to keep state in sync.
      setTimeout(function () { self._renderState(); }, 400);
    }
  };

  // Play is always "start from the beginning, with sound" in this player.
  VideoPreviewPlayer.prototype._playFromStart = function (e) {
    this._ended = false;
    this._beginPlayStart();
    this._provider.seekTo(0);
    this._unmute(e);
  };

  // Marks the start-of-play window (also used for initial autoplay): suppresses
  // the paused UI until PLAYING actually fires, with a safety net so the
  // overlay can never get stuck hidden.
  VideoPreviewPlayer.prototype._beginPlayStart = function () {
    this._startingPlay = true;
    var self = this;
    clearTimeout(this._startTimer);
    this._startTimer = setTimeout(function () {
      self._startingPlay = false;
      self._renderState();
    }, 2500);
  };

  // Material-style ripple: a circle expands from the click point and fades.
  VideoPreviewPlayer.prototype._rippleOut = function (e) {
    var rect = this.root.getBoundingClientRect();
    var x = e && e.clientX ? e.clientX - rect.left : rect.width / 2;
    var y = e && e.clientY ? e.clientY - rect.top : rect.height / 2;
    var scale = (Math.max(rect.width, rect.height) * 2.2) / 100;
    var r = document.createElement('div');
    r.className = 'vpp-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.setProperty('--vpp-ripple-scale', scale.toFixed(2));
    this.root.appendChild(r);
    void r.offsetWidth; // force reflow so the animation starts from scale(0)
    r.classList.add('vpp-ripple--active');
    var self = this;
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 700);
  };

  /* ----- state / skin rendering ----- */
  VideoPreviewPlayer.prototype._renderState = function () {
    var playing = this._provider.isPlaying();
    var muted = this._provider.isMuted();

    // Play / pause icon
    this.root.classList.toggle('vpp-is-playing', playing);
    this.playToggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');

    // Mute icon + volume slider
    this._renderVolume();

    // Overlay visibility (the backdrop scrim is part of the overlay)
    if (!playing) {
      var rawState = this._provider.getState ? this._provider.getState() : PROVIDER_STATE.PAUSED;
      if (this._startingPlay || rawState === PROVIDER_STATE.BUFFERING) {
        // Play-start or buffering window: don't flash the paused UI.
        this.overlay.classList.add('vpp-overlay--hidden');
      } else {
        this.textPrimary.textContent = this._ended ? this.options.textEnded : this.options.textPaused;
        this.textSecondary.textContent = '';
        this.soundBars.classList.add('vpp-hidden');
        this.overlay.classList.remove('vpp-overlay--hidden');
      }
    } else if (muted && !this._unmuted) {
      this.textPrimary.textContent = this.options.unmuteText;
      this.textSecondary.textContent = this.options.unmuteTextSecondary;
      this.soundBars.classList.remove('vpp-hidden');
      this.overlay.classList.remove('vpp-overlay--hidden');
    } else {
      this.overlay.classList.add('vpp-overlay--hidden');
    }

    // Watermark visibility per timing option
    this._syncWatermark();
  };

  VideoPreviewPlayer.prototype._syncWatermark = function () {
    if (!this.watermark) return;
    var t = this.options.watermarkTiming;
    var show = t !== 'none' && (
      t === 'always' ||
      (t === 'before' && !this._interacted) ||
      (t === 'after' && this._interacted)
    );
    this.watermark.classList.toggle('vpp-hidden', !show);
  };

  VideoPreviewPlayer.prototype._renderProgress = function (frac) {
    var pct = Math.round((frac || 0) * 100);
    this.progressFill.style.width = pct + '%';
    this.progress.setAttribute('aria-valuenow', String(pct));
  };

  VideoPreviewPlayer.prototype._renderVolume = function () {
    var muted = this._provider.isMuted();
    this.root.classList.toggle('vpp-is-muted', muted);
    this.muteToggle.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    if (!this._volumeDragging) {
      var v = this._provider.getVolume();
      if (v !== +this.volumeSlider.value) this.volumeSlider.value = v;
    }
  };

  /* ----- auto-hiding control bar ----- */
  VideoPreviewPlayer.prototype._showControls = function () {
    this._cancelHide();
    if (!this._interacted) return; // no HUD at all until the first click
    this.root.classList.remove('vpp-controls-hidden');
  };

  VideoPreviewPlayer.prototype._scheduleHide = function () {
    var self = this;
    this._cancelHide();
    this._hideTimer = setTimeout(function () {
      if (self._provider.isPlaying() && !self.controls.contains(document.activeElement)) {
        self.root.classList.add('vpp-controls-hidden');
      }
    }, this.options.controlsHideDelay);
  };

  VideoPreviewPlayer.prototype._cancelHide = function () {
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
  };

  /* ----- lottie play-button animation (optional) ----- */
  VideoPreviewPlayer.prototype._setupLottie = function () {
    var self = this;
    var el = this.lottieEl;
    el.style.width = this.options.lottieSize + 'px';
    el.style.height = this.options.lottieSize + 'px';

    loadLottie().then(function (lottie) {
      if (!lottie || !self.root || !self.root.isConnected) return;

      // Fetch the animation data ourselves so we can recolor layers,
      // mirroring the original player's color-mapping behaviour.
      fetch(self.options.lottieFileUrl)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          // Unless the caller picked colors, auto-contrast against the backdrop
          // so the button is visible on dark and light scrims alike.
          var colors = self.options.lottieColors;
          if (!colors && self.options.backdrop !== 'none') {
            colors = [contrastColor(resolveBackdrop(self.options.backdrop))];
          }
          if (colors && Array.isArray(data.layers)) {
            data.layers.forEach(function (layer, i) {
              var color = colors[i % colors.length];
              var rgb = hexToRgb(color);
              if (!rgb) return;
              (layer.shapes || []).forEach(function (shape) {
                (shape.it || []).forEach(function (it) {
                  if ((it.ty === 'st' || it.ty === 'fl') && it.c && it.c.k) it.c.k = rgb;
                });
              });
            });
          }
          self._lottieAnim = lottie.loadAnimation({
            container: el,
            renderer: 'svg',
            loop: self.options.lottieLoop,
            autoplay: self.options.lottieAutoplay,
            animationData: data,
          });
          self.root.classList.add('vpp-has-lottie'); // swap CSS bars for the animation
        })
        .catch(function () { /* non-fatal: keep the CSS sound bars */ });
    });
  };

  VideoPreviewPlayer.prototype._startTicker = function () {
    var self = this;
    this._ticker = setInterval(function () {
      if (!self._provider.isPlaying()) return;
      var cur = self._provider.getCurrentTime() || 0;
      var dur = self._provider.getDuration() || 0;
      if (dur) self._renderProgress(cur / dur);
      self.timeEl.textContent = fmtTime(cur) + (dur ? ' / ' + fmtTime(dur) : '');
      self._renderVolume();
    }, 250);
  };

  /* ----- teardown ----- */
  VideoPreviewPlayer.prototype.destroy = function () {
    this._cancelHide();
    if (this._startTimer) clearTimeout(this._startTimer);
    if (this._ticker) clearInterval(this._ticker);
    if (this._lottieAnim) this._lottieAnim.destroy();
    if (this._provider) this._provider.destroy();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
  };

  /* ----- helpers ----- */
  function merge(base, over) {
    var out = {};
    for (var k in base) out[k] = base[k];
    if (over) for (var j in over) {
      if (over[j] !== undefined) out[j] = over[j];
    }
    return out;
  }

  function resolveTarget(target) {
    if (typeof target === 'string') return document.querySelector(target);
    if (target instanceof Element) return target;
    return null;
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ----- auto-init: <div class="vpp" data-video-id="..." ...></div> ----- */
  function autoInit() {
    var els = document.querySelectorAll('.vpp[data-video-id]');
    Array.prototype.forEach.call(els, function (el) {
      var opts = {
        target: el,
        videoId: el.getAttribute('data-video-id'),
        provider: el.getAttribute('data-provider') || undefined,
        autoPlay: attrBool(el, 'data-autoplay', true),
        loop: attrBool(el, 'data-loop', true),
        muted: attrBool(el, 'data-muted', true),
        privacyMode: attrBool(el, 'data-privacy-mode', true),
        backdrop: el.getAttribute('data-backdrop') || undefined,
        backdropTransition: el.getAttribute('data-backdrop-transition') || undefined,
        watermarkTextContent: el.getAttribute('data-watermark') || undefined,
        watermarkPosition: el.getAttribute('data-watermark-position') || undefined,
        watermarkTiming: el.getAttribute('data-watermark-timing') || undefined,
        unmuteText: el.getAttribute('data-unmute-text') || undefined,
        unmuteTextSecondary: el.getAttribute('data-unmute-secondary') || undefined,
      };
      try {
        new VideoPreviewPlayer(opts);
      } catch (err) {
        if (window.console) console.error('[video-preview-player]', err);
      }
      el.removeAttribute('data-video-id'); // avoid double init
    });
  }

  function attrBool(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v === null) return fallback;
    return v === 'true' || v === '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  return VideoPreviewPlayer;
});
