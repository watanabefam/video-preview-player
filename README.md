# video-preview-player

A **muted, autoplay, custom-skinned video preview player** for the web.

It embeds a video that starts playing **silently, on a loop**, with YouTube's
native chrome hidden and replaced by your own skin — a *"Click For Sound"*
overlay, a custom progress bar, and a watermark. Think of the preview players
you see on marketing / campaign landing pages.

Built on a **provider-agnostic core**: YouTube ships built-in, and Vimeo,
hosted MP4s, Twitch, etc. can be added by implementing one small interface.

- ✅ Zero dependencies, ~300 lines, MIT licensed
- ✅ Muted autoplay + loop (YouTube's own IFrame API underneath)
- ✅ "Click For Sound" unmute overlay
- ✅ Custom play/pause, progress bar (click + drag to seek), time readout
- ✅ Control bar auto-hides after a few seconds of inactivity while playing
- ✅ Mute toggle + volume slider
- ✅ Clicking **play** always restarts the video from the beginning, with sound
- ✅ Optional Lottie play-button animation (`lottieFileUrl`) with layer recolor — falls back to a CSS animation when Lottie isn't available
- ✅ Text or image watermark, configurable position / size / transparency
- ✅ Fully themable colors
- ✅ Privacy mode: uses `youtube-nocookie.com` by default
- 🚫 Not an ad-blocker — this wraps the official embed API. YouTube can still
  serve ads on monetized videos. If you need *no ads, period*, pair this with
  an ad-blocker (e.g. uBlock Origin) or a proxy frontend (Invidious / Piped).

## Live demo

<https://watanabefam.github.io/video-preview-player/>

## Quick start

```html
<link rel="stylesheet" href="src/video-preview-player.css" />
<script src="src/video-preview-player.js"></script>

<div id="my-player"></div>

<script>
  new VideoPreviewPlayer({
    target: '#my-player',
    provider: 'youtube',
    videoId: 'aqz-KE-bpKQ',          // Big Buck Bunny — open licensed demo
    autoPlay: true,
    loop: true,
    muted: true,
    unmuteText: 'Video is Playing…',
    unmuteTextSecondary: 'Click For Sound',
    watermarkTextContent: 'Your Brand',
    watermarkPosition: 'right-top',
  });
</script>
```

### Or markup-driven (auto-initializes)

```html
<div class="vpp"
     data-video-id="aqz-KE-bpKQ"
     data-provider="youtube"
     data-muted="1"
     data-watermark="Your Brand"
     data-watermark-position="left-bottom"></div>
```

## Options

| Option | Default | Description |
|---|---|---|
| `target` | — | CSS selector or element to mount into (required) |
| `provider` | `'youtube'` | Video backend. See [Adding providers](#adding-providers) |
| `videoId` | — | Video id for the provider (required) |
| `autoPlay` | `true` | Start playing on load |
| `loop` | `true` | Loop the video |
| `muted` | `true` | Start muted (browsers require this for autoplay) |
| `privacyMode` | `true` | Use `youtube-nocookie.com` where possible |
| `playerVars` | `{}` | Raw player params merged last (YouTube) |
| `textPaused` / `textEnded` | `'Paused'` / `'Ended'` | Overlay copy in those states |
| `unmuteText` | `'Video is Playing…'` | Overlay primary copy while muted |
| `unmuteTextSecondary` | `'Click For Sound'` | Overlay secondary copy |
| `colorBars` | `'#3f72af'` | Bottom bar accent |
| `colorPlayButton` | `'#3f72af'` | Play/pause button color |
| `colorProgressBarTotal` | `rgba(255,255,255,0.65)` | Progress track |
| `colorProgressBar` | `'#112d4e'` | Progress fill |
| `colorOverlayText` | `rgba(0,0,0,0.75)` | Paused/ended overlay tint |
| `controlsHideDelay` | `2500` | ms of inactivity before the control bar auto-hides (while playing); `0` disables |
| `lottieFileUrl` | `''` | URL/path to a Lottie `.json` play-button animation (lottie-web loads on demand from CDN; CSS bars remain if unset/failed) |
| `lottieLoop` / `lottieAutoplay` | `true` / `true` | Lottie playback |
| `lottieColors` | `null` | `[hex, …]` recolors animation layers in order (like the original player's color mapping) |
| `lottieSize` | `120` | px size of the animation in the overlay |
| `watermarkTextContent` | `''` | Watermark text (falls back to image mode if `watermarkImageUrl` set) |
| `watermarkImageUrl` | `''` | Watermark image URL |
| `watermarkTextColor` | `'#ffffff'` | Watermark text color |
| `watermarkTransparency` | `0` | 0–100 (0 = opaque) |
| `watermarkSize` | `150` | px (font size for text, width for images) |
| `watermarkPosition` | `'right-top'` | `left-top` \| `right-top` \| `left-bottom` \| `right-bottom` \| `center` |

## Lottie play-button animation

Set `lottieFileUrl` to a Lottie `.json` and the overlay swaps the CSS sound bars
for the animation. `lottieColors` recolors layers in order.

```js
new VideoPreviewPlayer({
  target: '#player',
  videoId: 'aqz-KE-bpKQ',
  lottieFileUrl: 'lottie/play-button.json',
  lottieColors: ['#2dd4bf', '#ffffff'], // ring + play triangle
  lottieSize: 130,
});
```

The bundled `lottie/play-button.json` is the animation used by the original
product's public demo embed (a ring that draws itself + a play triangle),
included here for reference. If you distribute your own build, swap in a
properly licensed animation — the [LottieFiles free library](https://lottiefiles.com/search?q=play+button)
has plenty under their free commercial license. (`lottie-web` itself is MIT.)

## Adding providers (Vimeo / MP4 / Twitch…)

A provider is a class with a fixed contract, registered globally:

```js
VideoPreviewPlayer.registerProvider('vimeo', VimeoProvider);
```

Required members — `constructor(slot, options)` that injects media into
`slot`, plus: `onReady(cb)`, `onStateChange(cb)` (states: 0 ended, 1 playing,
2 paused, 3 buffering, 5 ready), `play()`, `pause()`, `mute()`, `unmute()`,
`seekTo(s)`, `isMuted()`, `isPlaying()`, `getCurrentTime()`, `getDuration()`,
`destroy()`. See `src/video-preview-player.js` for the reference
implementation (`YouTubeProvider`).

## Roadmap

- [x] YouTube provider
- [ ] Vimeo provider
- [ ] Hosted MP4 / HLS provider
- [ ] Twitch / other outlets
- [ ] `play()`/`pause()` public API + `ended` event hooks
- [ ] Volume control
- [ ] React / Vue / WordPress wrapper

## License

MIT © ThePopularizer
