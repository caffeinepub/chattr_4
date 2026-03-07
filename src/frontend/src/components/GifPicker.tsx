import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const GIPHY_API_KEY = "rDA2nx5ya4RMgjd6KOJ0lrAtm9KLBWUv";

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height_small: GiphyImage;
    original: GiphyImage;
  };
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

type Tab = "trending" | "search";

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTrending = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`,
      );
      if (!res.ok) throw new Error("Failed to fetch trending");
      const data = await res.json();
      setGifs(data.data as GiphyGif[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  const fetchSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setGifs([]);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=g`,
      );
      if (!res.ok) throw new Error("Failed to fetch search");
      const data = await res.json();
      setGifs(data.data as GiphyGif[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  // Focus search input when switching to search tab
  useEffect(() => {
    if (activeTab === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [activeTab]);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "trending") {
      setSearchQuery("");
      fetchTrending();
    } else {
      setGifs([]);
      setStatus("ready");
    }
  }

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSearch(val);
    }, 300);
  }

  function handleGifSelect(gif: GiphyGif) {
    onSelect(gif.images.original.url);
  }

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="flex flex-col"
      style={{
        backgroundColor: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: 12,
        width: 300,
        maxHeight: 440,
        overflow: "hidden",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}
      data-ocid="gif_picker.panel"
    >
      {/* Header: tabs + close */}
      <div
        className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0"
        style={{ borderBottom: "1px solid #2a2a2a" }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleTabChange("trending")}
            className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded transition-all"
            style={{
              backgroundColor:
                activeTab === "trending" ? "#4a9e5c18" : "transparent",
              color: activeTab === "trending" ? "#4a9e5c" : "#555",
              border:
                activeTab === "trending"
                  ? "1px solid #4a9e5c44"
                  : "1px solid transparent",
            }}
            data-ocid="gif_picker.trending_tab"
          >
            Trending
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("search")}
            className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded transition-all"
            style={{
              backgroundColor:
                activeTab === "search" ? "#4a9e5c18" : "transparent",
              color: activeTab === "search" ? "#4a9e5c" : "#555",
              border:
                activeTab === "search"
                  ? "1px solid #4a9e5c44"
                  : "1px solid transparent",
            }}
            data-ocid="gif_picker.search_tab"
          >
            Search
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full transition-colors hover:bg-white/10"
          style={{ color: "#555" }}
          aria-label="Close GIF picker"
        >
          <X size={13} />
        </button>
      </div>

      {/* Search input (search tab only) */}
      {activeTab === "search" && (
        <div className="px-3 py-2 shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search GIFs…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full font-mono text-xs rounded-lg px-3 py-2 outline-none"
            style={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#e0e0e0",
            }}
            data-ocid="gif_picker.search_input"
          />
        </div>
      )}

      {/* Attribution */}
      <div
        className="px-3 pb-1 shrink-0 font-mono text-[9px] uppercase tracking-wider"
        style={{ color: "#333" }}
      >
        Powered by GIPHY
      </div>

      {/* Grid area */}
      <div
        className="overflow-y-auto flex-1"
        style={{ overscrollBehavior: "contain" }}
      >
        {status === "loading" && (
          <div className="p-3">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items are positional
                  key={i}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 6,
                    backgroundColor: "#1a1a1a",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <p className="font-mono text-xs" style={{ color: "#555" }}>
              Couldn't load GIFs
            </p>
            <button
              type="button"
              onClick={
                activeTab === "trending"
                  ? fetchTrending
                  : () => fetchSearch(searchQuery)
              }
              className="font-mono text-[11px] px-3 py-1.5 rounded transition-colors"
              style={{
                backgroundColor: "#1a1a1a",
                border: "1px solid #2a2a2a",
                color: "#4a9e5c",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {status === "ready" && gifs.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <p className="font-mono text-xs" style={{ color: "#555" }}>
              {activeTab === "search" && searchQuery.trim()
                ? "No results"
                : activeTab === "search"
                  ? "Type to search GIFs"
                  : "No GIFs found"}
            </p>
          </div>
        )}

        {status === "ready" && gifs.length > 0 && (
          <div
            className="p-2 grid gap-1.5"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            {gifs.map((gif) => (
              <button
                type="button"
                key={gif.id}
                onClick={() => handleGifSelect(gif)}
                className="relative overflow-hidden rounded transition-all hover:opacity-80 hover:scale-[1.02]"
                style={{
                  aspectRatio: "1",
                  border: "1px solid #2a2a2a",
                  padding: 0,
                  background: "#1a1a1a",
                }}
                title={gif.title}
              >
                <img
                  src={gif.images.fixed_height_small.url}
                  alt={gif.title}
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: 5,
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
