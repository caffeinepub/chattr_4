import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { UserProfile } from "../backendApi";
import { setUsername as storeSetUsername } from "../store";
import { generatePixelAvatar } from "../utils/pixelAvatar";
import GifPicker from "./GifPicker";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  currentProfile: UserProfile;
  onProfileUpdated: (profile: UserProfile) => void;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export default function SettingsModal({
  open,
  onClose,
  sessionId,
  currentProfile,
  onProfileUpdated,
}: SettingsModalProps) {
  const [username, setUsernameState] = useState(currentProfile.username);
  const [usernameError, setUsernameError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    currentProfile.avatarUrl ?? null,
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(
    currentProfile.avatarUrl ?? null,
  );
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultAvatar = generatePixelAvatar(sessionId, 72);

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
    // Skip check if same as current
    if (username.trim() === currentProfile.username) {
      setUsernameError("");
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
      // Ignore
    } finally {
      setCheckingUsername(false);
    }
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    try {
      const dataUrl = await readFileAsBase64(file);
      setAvatarDataUrl(dataUrl);
      setAvatarPreview(dataUrl);
      setAvatarChanged(true);
    } catch {
      toast.error("Failed to read image");
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleAvatarFile(file);
    e.target.value = "";
  }

  async function handleSave() {
    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
      return;
    }

    setSaving(true);
    try {
      let updatedProfile = currentProfile;

      // Update username if changed
      if (username.trim() !== currentProfile.username) {
        const taken = await backendApi.isUsernameTaken(username.trim());
        if (taken) {
          setUsernameError("That username is already taken");
          setSaving(false);
          return;
        }
        const result = await backendApi.updateUsername(
          sessionId,
          username.trim(),
        );
        if (result.__kind__ === "err") {
          setUsernameError(result.err);
          setSaving(false);
          return;
        }
        updatedProfile = result.ok;
        storeSetUsername(updatedProfile.username);
      }

      // Update avatar if changed
      if (avatarChanged) {
        const result = await backendApi.setAvatar(sessionId, avatarDataUrl);
        if (result.__kind__ === "ok") {
          updatedProfile = result.ok;
        }
      }

      onProfileUpdated(updatedProfile);
      toast.success("Profile updated");
      onClose();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    username.trim() !== currentProfile.username || avatarChanged;
  const canSave = hasChanges && !usernameError && !checkingUsername && !saving;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        style={{
          backgroundColor: "#111111",
          border: "1px solid #2a2a2a",
          color: "#e0e0e0",
          maxWidth: 400,
        }}
        data-ocid="settings.dialog"
      >
        <DialogHeader>
          <DialogTitle
            className="font-mono"
            style={{ color: "#4a9e5c", fontSize: 14 }}
          >
            Edit Profile
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar section */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: 72, height: 72 }}>
              <img
                src={avatarPreview ?? defaultAvatar}
                alt="Your avatar"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #2a2a2a",
                }}
              />
              {avatarPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPreview(null);
                    setAvatarDataUrl(null);
                    setAvatarChanged(true);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#c0392b", color: "#fff" }}
                  aria-label="Remove avatar"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowGifPicker(false);
                  fileInputRef.current?.click();
                }}
                className="font-mono text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                style={{ color: "#555" }}
                data-ocid="settings.avatar_upload_button"
              >
                <ImagePlus size={11} />
                {avatarPreview ? "Change" : "Upload"}
              </button>
              <span
                className="font-mono text-[10px]"
                style={{ color: "#2a2a2a" }}
              >
                |
              </span>
              <button
                type="button"
                onClick={() => setShowGifPicker((v) => !v)}
                className="font-mono text-[10px] uppercase tracking-wider transition-colors"
                style={{ color: showGifPicker ? "#ff6b9d" : "#555" }}
                data-ocid="settings.gif_avatar_button"
              >
                🎞 GIF
              </button>
            </div>

            {/* Inline GIF picker */}
            {showGifPicker && (
              <div style={{ maxWidth: 300, width: "100%" }}>
                <GifPicker
                  onSelect={(gifUrl) => {
                    setAvatarPreview(gifUrl);
                    setAvatarDataUrl(gifUrl);
                    setAvatarChanged(true);
                    setShowGifPicker(false);
                  }}
                  onClose={() => setShowGifPicker(false)}
                />
              </div>
            )}

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
              htmlFor="settings-username"
              className="font-mono text-xs uppercase tracking-wider"
              style={{ color: "#888" }}
            >
              Username
            </label>
            <div className="relative">
              <Input
                id="settings-username"
                value={username}
                onChange={(e) => {
                  setUsernameState(e.target.value);
                  if (usernameError) {
                    const err = validateUsername(e.target.value);
                    if (!err) setUsernameError("");
                  }
                }}
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
                data-ocid="settings.username_input"
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px]"
                style={{ color: username.length > 18 ? "#c0392b" : "#444" }}
              >
                {username.length}/20
              </span>
            </div>

            {(usernameError || checkingUsername) && (
              <p
                className="font-mono text-[11px] flex items-center gap-1"
                style={{ color: usernameError ? "#c0392b" : "#888" }}
              >
                {checkingUsername ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    Checking…
                  </>
                ) : (
                  usernameError
                )}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="font-mono text-xs"
            style={{ color: "#888" }}
            data-ocid="settings.close_button"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="font-mono text-xs uppercase tracking-wider"
            style={{
              backgroundColor: canSave ? "#4a9e5c" : "#1a1a1a",
              color: canSave ? "#0d0d0d" : "#444",
              border: canSave ? "none" : "1px solid #2a2a2a",
            }}
            data-ocid="settings.save_button"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Saving…
              </span>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
