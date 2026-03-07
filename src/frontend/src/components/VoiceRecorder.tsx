import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
      chunksRef.current = [];

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        // Pick a supported MIME type
        const mimeType =
          [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
            "audio/mp4",
          ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(100); // collect in 100ms chunks
        setIsRecording(true);
        setElapsed(0);
        startTimer();
      } catch {
        mediaRecorderRef.current = null;
      }
    },
    [disabled, startTimer],
  );

  const stopAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || cancelledRef.current) return;
    if (recorder.state === "inactive") return;

    stopTimer();
    const durationMs = Date.now() - startMsRef.current;
    setIsRecording(false);

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      // Stop all tracks
      for (const track of recorder.stream.getTracks()) track.stop();
      mediaRecorderRef.current = null;
      setElapsed(0);

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onSend(dataUrl, durationMs);
      };
      reader.readAsDataURL(blob);
    };

    recorder.stop();
  }, [stopTimer, onSend]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || cancelledRef.current) return;

    cancelledRef.current = true;
    setCancelled(true);
    stopTimer();
    setIsRecording(false);
    setElapsed(0);

    if (recorder.state !== "inactive") {
      recorder.onstop = () => {
        chunksRef.current = [];
        for (const track of recorder.stream.getTracks()) track.stop();
        mediaRecorderRef.current = null;
      };
      recorder.stop();
    } else {
      for (const track of recorder.stream.getTracks()) track.stop();
      mediaRecorderRef.current = null;
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
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          for (const track of recorder.stream.getTracks()) track.stop();
        };
        recorder.stop();
      }
      mediaRecorderRef.current = null;
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
