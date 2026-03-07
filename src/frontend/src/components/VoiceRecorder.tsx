import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AudioRecorder from "simple-audio-recorder";

// Preload the MP3 worker once at module level
AudioRecorder.preload("/mp3worker.js");

interface VoiceRecorderProps {
  disabled?: boolean;
  onSend: (audioDataUrl: string, durationMs: number) => void;
  onCancel?: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function VoiceRecorder({
  disabled,
  onSend,
  onCancel,
  onRecordingStateChange,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cancelled, setCancelled] = useState(false);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const startXRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef = useRef<number>(0);

  // Sync isRecording to parent
  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  const startTimer = useCallback(() => {
    startMsRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startMsRef.current);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(
    async (startX: number) => {
      if (disabled) return;
      cancelledRef.current = false;
      setCancelled(false);
      startXRef.current = startX;

      try {
        const recorder = new AudioRecorder();
        recorderRef.current = recorder;
        await recorder.start();
        setIsRecording(true);
        setElapsed(0);
        startTimer();
      } catch {
        recorderRef.current = null;
      }
    },
    [disabled, startTimer],
  );

  const stopAndSend = useCallback(async () => {
    if (!recorderRef.current || cancelledRef.current) return;

    stopTimer();
    const durationMs = Date.now() - startMsRef.current;
    setIsRecording(false);

    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      setElapsed(0);

      // Convert to base64 data URL
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onSend(dataUrl, durationMs);
      };
      reader.readAsDataURL(blob);
    } catch {
      recorderRef.current = null;
    }
  }, [stopTimer, onSend]);

  const cancelRecording = useCallback(async () => {
    if (!recorderRef.current || cancelledRef.current) return;

    cancelledRef.current = true;
    setCancelled(true);
    stopTimer();
    setIsRecording(false);
    setElapsed(0);

    try {
      await recorderRef.current.stop();
    } catch {
      // ignore
    } finally {
      recorderRef.current = null;
    }

    onCancel?.();
  }, [stopTimer, onCancel]);

  // Mouse handlers
  function handleMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    e.preventDefault();
    startRecording(e.clientX);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isRecording || startXRef.current === null) return;
    const delta = startXRef.current - e.clientX;
    if (delta > 60) {
      cancelRecording();
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!isRecording) return;
    e.preventDefault();
    stopAndSend();
  }

  // Touch handlers
  function handleTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    e.preventDefault();
    const touch = e.touches[0];
    startRecording(touch.clientX);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isRecording || startXRef.current === null) return;
    const touch = e.touches[0];
    const delta = startXRef.current - touch.clientX;
    if (delta > 60) {
      cancelRecording();
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isRecording) return;
    e.preventDefault();
    stopAndSend();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
        recorderRef.current = null;
      }
    };
  }, [stopTimer]);

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {/* Slide-to-cancel hint */}
      {isRecording && (
        <div
          className="flex items-center gap-1.5 font-mono text-[11px] animate-pulse"
          style={{ color: cancelled ? "#e05555" : "#888" }}
        >
          <span>←</span>
          <span>slide to cancel</span>
          <span
            className="font-mono text-[11px] ml-1 tabular-nums"
            style={{ color: "#e05555" }}
          >
            {formatElapsed(elapsed)}
          </span>
        </div>
      )}

      {/* Mic button */}
      <button
        type="button"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        disabled={disabled}
        className="shrink-0 p-2.5 rounded-full transition-colors disabled:opacity-40 select-none"
        style={{
          backgroundColor: isRecording ? "#e0555518" : "#1e1e1e",
          color: isRecording ? "#e05555" : "#666",
          touchAction: "none",
        }}
        aria-label={
          isRecording
            ? "Recording… release to send"
            : "Hold to record voice message"
        }
        data-ocid="thread.voice_button"
      >
        <Mic
          size={16}
          className={isRecording ? "animate-pulse" : ""}
          style={{ color: isRecording ? "#e05555" : "#666" }}
        />
      </button>
    </div>
  );
}
