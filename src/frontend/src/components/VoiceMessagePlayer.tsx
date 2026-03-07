import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface VoiceMessagePlayerProps {
  src: string;
  isOwn: boolean;
  durationMs?: number;
}

const BAR_COUNT = 22;

/** Deterministic bar heights from a string hash */
function generateBars(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = (hash * 1664525 + 1013904223) | 0;
    const normalized = (Math.abs(hash) % 100) / 100;
    // Bias toward middle heights — more natural waveform look
    const height = 0.2 + normalized * 0.8;
    bars.push(height);
  }
  return bars;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceMessagePlayer({
  src,
  isOwn,
  durationMs,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    durationMs !== undefined ? durationMs / 1000 : 0,
  );

  // Generate deterministic waveform bars from src hash (first 40 chars are enough)
  const bars = useMemo(() => generateBars(src.slice(0, 40)), [src]);

  // Progress: 0–1
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const activeCount = Math.round(progress * BAR_COUNT);

  const activeColor = isOwn ? "#6abd7c" : "#4a9e5c";
  const inactiveColor = isOwn ? "#2d5e38" : "#2a2a2a";

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onPlay() {
      setPlaying(true);
    }
    function onPause() {
      setPlaying(false);
    }
    function onTimeUpdate() {
      setCurrentTime(audio!.currentTime);
    }
    function onDurationChange() {
      if (!Number.isNaN(audio!.duration) && Number.isFinite(audio!.duration)) {
        setDuration(audio!.duration);
      }
    }
    function onEnded() {
      setPlaying(false);
      setCurrentTime(0);
    }

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Allow scrubbing by clicking on waveform
  function handleWaveformClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }

  return (
    <div
      className="flex items-center gap-2"
      style={{ maxWidth: 240, width: "100%" }}
    >
      {/* Hidden audio element */}
      {/* biome-ignore lint/a11y/useMediaCaption: voice message, no caption available */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        type="button"
        onClick={handlePlayPause}
        className="shrink-0 flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 32,
          height: 32,
          backgroundColor: activeColor,
          color: "#fff",
        }}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        data-ocid="thread.voice_play_button"
      >
        {playing ? (
          <Pause size={14} fill="white" />
        ) : (
          <Play size={14} fill="white" />
        )}
      </button>

      {/* Waveform bars (clickable for scrubbing) */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: waveform click for scrubbing */}
      <div
        className="flex items-center gap-px cursor-pointer flex-1"
        style={{ height: 28 }}
        onClick={handleWaveformClick}
        aria-label="Voice message waveform"
      >
        {bars.map((heightRatio, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static bars, index is stable
            key={i}
            style={{
              width: 3,
              borderRadius: 2,
              height: `${Math.round(heightRatio * 22) + 4}px`,
              backgroundColor: i < activeCount ? activeColor : inactiveColor,
              flexShrink: 0,
              transition: "background-color 0.1s ease",
            }}
          />
        ))}
      </div>

      {/* Time display */}
      <span
        className="shrink-0 font-mono tabular-nums"
        style={{
          fontSize: 10,
          color: isOwn ? "#6abd7c88" : "#555",
          minWidth: 52,
          textAlign: "right",
        }}
      >
        {formatDuration(currentTime)} / {formatDuration(duration)}
      </span>
    </div>
  );
}
