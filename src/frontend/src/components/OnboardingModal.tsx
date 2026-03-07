import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { UserProfile } from "../backendApi";
import { markOnboarded, setUsername } from "../store";
import { generatePixelAvatar } from "../utils/pixelAvatar";

interface OnboardingModalProps {
  sessionId: string;
  onComplete: (profile: UserProfile) => void;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OnboardingModal({
  sessionId,
  onComplete,
}: OnboardingModalProps) {
  const [username, setUsernameState] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const defaultAvatar = generatePixelAvatar(sessionId, 80);

  function validateUsername(val: string): string {
    if (!val.trim()) return "Username is required";
    if (val.length > 20) return "Username must be 20 characters or less";
    if (!USERNAME_REGEX.test(val))
      return "Only letters, numbers, underscores, and hyphens allowed";
    return "";
  }

  async function handleUsernameBlur() {
    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
      return;
    }
    setCheckingUsername(true);
    try {
      const taken = await backendApi.isUsernameTaken(username.trim());
      if (taken) {
        setUsernameError("That username is already taken");
      } else {
        setUsernameError("");
      }
    } catch {
      // Ignore network errors on blur
    } finally {
      setCheckingUsername(false);
    }
  }

  function handleUsernameChange(val: string) {
    setUsernameState(val);
    if (usernameError) {
      const err = validateUsername(val);
      if (!err) setUsernameError("");
    }
  }

  const handleAvatarFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    try {
      const dataUrl = await readFileAsBase64(file);
      setAvatarDataUrl(dataUrl);
      setAvatarPreview(dataUrl);
    } catch {
      toast.error("Failed to read image");
    }
  }, []);

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleAvatarFile(file);
    e.target.value = "";
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        await handleAvatarFile(imageFile);
      }
    },
    [handleAvatarFile],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
      return;
    }

    setSubmitting(true);
    try {
      // Check uniqueness once more
      const taken = await backendApi.isUsernameTaken(username.trim());
      if (taken) {
        setUsernameError("That username is already taken");
        setSubmitting(false);
        return;
      }

      // Register user
      const result = await backendApi.registerUser(sessionId, username.trim());
      if (result.__kind__ === "err") {
        setUsernameError(result.err);
        setSubmitting(false);
        return;
      }

      let profile = result.ok;

      // Set avatar if one was selected
      if (avatarDataUrl) {
        const avatarResult = await backendApi.setAvatar(
          sessionId,
          avatarDataUrl,
        );
        if (avatarResult.__kind__ === "ok") {
          profile = avatarResult.ok;
        }
      }

      // Persist locally
      markOnboarded();
      setUsername(profile.username);

      onComplete(profile);
    } catch {
      toast.error("Failed to create profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Trap focus inside modal
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canSubmit =
    username.trim().length > 0 &&
    !usernameError &&
    !checkingUsername &&
    !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      data-ocid="onboarding.modal"
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 relative"
        style={{
          backgroundColor: "#111111",
          border: "1px solid #2a2a2a",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="font-mono text-xs uppercase tracking-widest mb-2"
            style={{ color: "#4a9e5c" }}
          >
            chattr
          </div>
          <h1
            className="font-semibold text-xl"
            style={{ color: "#e0e0e0", fontFamily: "'Geist Mono', monospace" }}
          >
            Pick your identity
          </h1>
          <p className="font-mono text-xs mt-1.5" style={{ color: "#555" }}>
            One-time setup — no account required
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar section */}
          <div className="flex flex-col items-center gap-3">
            {/* Avatar preview / dropzone */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: div with drag-drop and click-to-open-file-dialog; keyboard users can use the button below */}
            <div
              className="relative cursor-pointer rounded-full"
              style={{ width: 80, height: 80 }}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-ocid="onboarding.avatar_dropzone"
            >
              <img
                src={avatarPreview ?? defaultAvatar}
                alt="Your avatar"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: isDragging
                    ? "2px dashed #4a9e5c"
                    : "2px solid #2a2a2a",
                  transition: "border-color 0.15s",
                }}
              />
              {/* Upload overlay */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                <ImagePlus size={20} style={{ color: "#4a9e5c" }} />
              </div>
              {/* Remove custom avatar */}
              {avatarPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPreview(null);
                    setAvatarDataUrl(null);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#c0392b", color: "#fff" }}
                  aria-label="Remove avatar"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{ color: "#555" }}
              data-ocid="onboarding.avatar_upload_button"
            >
              {avatarPreview ? "Change avatar" : "Upload avatar (optional)"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>

          {/* Username input */}
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-username"
              className="font-mono text-xs uppercase tracking-wider"
              style={{ color: "#888" }}
            >
              Username
            </label>
            <div className="relative">
              <Input
                id="onboarding-username"
                placeholder="e.g. anon_user"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onBlur={handleUsernameBlur}
                maxLength={20}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="font-mono text-sm pr-14"
                style={{
                  backgroundColor: "#0d0d0d",
                  border: `1px solid ${usernameError ? "#c0392b" : "#2a2a2a"}`,
                  color: "#e0e0e0",
                }}
                data-ocid="onboarding.username_input"
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px]"
                style={{ color: username.length > 18 ? "#c0392b" : "#444" }}
              >
                {username.length}/20
              </span>
            </div>

            {/* Error */}
            {(usernameError || checkingUsername) && (
              <div
                className="font-mono text-[11px] flex items-center gap-1"
                style={{ color: usernameError ? "#c0392b" : "#888" }}
                data-ocid="onboarding.error_state"
              >
                {checkingUsername ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    Checking availability…
                  </>
                ) : (
                  usernameError
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full font-mono text-sm uppercase tracking-widest"
            style={{
              backgroundColor: canSubmit ? "#4a9e5c" : "#1a1a1a",
              color: canSubmit ? "#0d0d0d" : "#444",
              border: canSubmit ? "none" : "1px solid #2a2a2a",
              fontWeight: 700,
              height: 44,
            }}
            data-ocid="onboarding.submit_button"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Joining…
              </span>
            ) : (
              "Join chattr"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
