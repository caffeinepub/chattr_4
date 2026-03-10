import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as backendApi from "../backendApi";
import type { Ban, Category, Post, Thread, ThreadReport } from "../backendApi";

const ADMIN_PASSWORD = "lunasimbaliamsammy123";

function timeAgo(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      onAuth();
      setError("");
    } else {
      setError("Invalid password. Access denied.");
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-24">
      <div
        className="rounded p-6"
        style={{ backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb" }}
      >
        <h1
          className="font-mono text-lg font-bold mb-1"
          style={{ color: "#2563eb" }}
        >
          {"//ADMIN"}
        </h1>
        <p className="font-mono text-xs mb-6" style={{ color: "#9ca3af" }}>
          Password required
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Enter admin password..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono text-sm"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
            }}
            data-ocid="admin.password_input"
            autoFocus
          />
          {error && (
            <p
              className="font-mono text-xs"
              style={{ color: "#c0392b" }}
              data-ocid="admin.error_state"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full font-mono text-xs uppercase tracking-wider"
            style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
            data-ocid="admin.login_button"
          >
            Authenticate
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Threads Tab ─────────────────────────────────────────────
function ThreadsTab() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const refresh = useCallback(async () => {
    const [t, c] = await Promise.all([
      backendApi.getAllThreads(),
      backendApi.getCategories(),
    ]);
    setThreads(t);
    setCategories(c);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function getCatName(id: bigint) {
    return categories.find((c) => c.id === id)?.name ?? "?";
  }

  return (
    <div>
      <h2
        className="font-mono text-sm font-bold mb-4"
        style={{ color: "#6b7280" }}
      >
        All Threads ({threads.length})
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#e5e7eb" }}>
              {["Title", "Category", "Posts", "Status", "Actions"].map((h) => (
                <TableHead
                  key={h}
                  className="font-mono text-xs uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {threads.map((thread, i) => (
              <TableRow
                key={String(thread.id)}
                style={{ borderColor: "#f3f4f6" }}
                data-ocid={`admin.thread.row.${i + 1}`}
              >
                <TableCell
                  className="font-sans text-sm max-w-xs truncate"
                  style={{ color: "#374151" }}
                >
                  {thread.title}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#6b7280" }}
                >
                  {getCatName(thread.categoryId)}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#6b7280" }}
                >
                  {Number(thread.postCount)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {thread.isArchived && (
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "#33333322", color: "#666" }}
                      >
                        archived
                      </span>
                    )}
                    {thread.isClosed && (
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "#c0392b22",
                          color: "#c0392b",
                        }}
                      >
                        closed
                      </span>
                    )}
                    {!thread.isArchived && !thread.isClosed && (
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "#2563eb22",
                          color: "#2563eb",
                        }}
                      >
                        active
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1.5 flex-wrap">
                    {!thread.isClosed && (
                      <button
                        type="button"
                        className="font-mono text-xs px-2 py-1 rounded transition-colors"
                        style={{ border: "1px solid #444", color: "#6b7280" }}
                        onClick={async () => {
                          await backendApi.updateThread(
                            thread.id,
                            true,
                            thread.isArchived,
                          );
                          toast.success("Thread closed");
                          refresh();
                        }}
                        data-ocid="admin.thread.secondary_button"
                      >
                        Close
                      </button>
                    )}
                    {thread.isClosed && !thread.isArchived && (
                      <button
                        type="button"
                        className="font-mono text-xs px-2 py-1 rounded transition-colors"
                        style={{
                          border: "1px solid #2563eb44",
                          color: "#2563eb",
                        }}
                        onClick={async () => {
                          await backendApi.updateThread(
                            thread.id,
                            false,
                            false,
                          );
                          toast.success("Thread reopened");
                          refresh();
                        }}
                        data-ocid="admin.thread.secondary_button"
                      >
                        Reopen
                      </button>
                    )}
                    {!thread.isArchived && (
                      <button
                        type="button"
                        className="font-mono text-xs px-2 py-1 rounded transition-colors"
                        style={{ border: "1px solid #55555544", color: "#777" }}
                        onClick={async () => {
                          await backendApi.updateThread(thread.id, true, true);
                          toast.success("Thread archived");
                          refresh();
                        }}
                        data-ocid="admin.thread.secondary_button"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Posts Tab ────────────────────────────────────────────────
function PostsTab() {
  const [posts, setPosts] = useState<Post[]>([]);

  const refresh = useCallback(async () => {
    const all = await backendApi.getAllPosts();
    // Show last 50 non-deleted posts, newest first
    const filtered = all
      .filter((p) => !p.isDeleted)
      .sort((a, b) => Number(b.createdAt - a.createdAt))
      .slice(0, 50);
    setPosts(filtered);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <h2
        className="font-mono text-sm font-bold mb-4"
        style={{ color: "#6b7280" }}
      >
        Recent Posts (last 50)
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#e5e7eb" }}>
              {["Author", "Thread", "Content", "Time", "Actions"].map((h) => (
                <TableHead
                  key={h}
                  className="font-mono text-xs uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post, i) => (
              <TableRow
                key={String(post.id)}
                style={{ borderColor: "#f3f4f6" }}
                data-ocid={`admin.post.row.${i + 1}`}
              >
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#111827" }}
                >
                  {post.authorSessionId}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#6b7280" }}
                >
                  #{String(post.threadId)}
                </TableCell>
                <TableCell
                  className="text-sm max-w-xs truncate"
                  style={{ color: "#4b5563" }}
                >
                  {post.content || `[${post.mediaType}]`}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#9ca3af" }}
                >
                  {timeAgo(backendApi.nsToMs(post.createdAt))}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs px-2 py-1 rounded"
                    style={{ border: "1px solid #c0392b44", color: "#c0392b" }}
                    onClick={async () => {
                      await backendApi.deletePost(post.id);
                      toast.success("Post deleted");
                      refresh();
                    }}
                    data-ocid="admin.post.delete_button"
                  >
                    Delete
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Bans Tab ─────────────────────────────────────────────────
function BansTab() {
  const [bans, setBans] = useState<Ban[]>([]);
  const [banId, setBanId] = useState("");
  const [banReason, setBanReason] = useState("");

  const refresh = useCallback(async () => {
    const b = await backendApi.getBans();
    setBans(b);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleBan(e: React.FormEvent) {
    e.preventDefault();
    if (!banId.trim()) {
      toast.error("User ID required");
      return;
    }
    await backendApi.banUser(
      banId.trim(),
      banReason.trim() || "Violating board rules",
    );
    toast.success(`${banId} banned`);
    setBanId("");
    setBanReason("");
    refresh();
  }

  return (
    <div>
      {/* Ban form */}
      <div
        className="rounded p-4 mb-6"
        style={{ backgroundColor: "#f8f9fa", border: "1px solid #e5e7eb" }}
      >
        <h3
          className="font-mono text-xs uppercase tracking-wider mb-3"
          style={{ color: "#6b7280" }}
        >
          Ban User
        </h3>
        <form onSubmit={handleBan} className="flex gap-2 flex-wrap">
          <Input
            placeholder="User ID (e.g. A3kX9mP2)"
            value={banId}
            onChange={(e) => setBanId(e.target.value)}
            className="font-mono text-xs w-40"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
            }}
            data-ocid="admin.ban_user_input"
          />
          <Input
            placeholder="Reason (optional)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            className="font-mono text-xs flex-1"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
            }}
            data-ocid="admin.ban_reason_input"
          />
          <Button
            type="submit"
            size="sm"
            className="font-mono text-xs uppercase shrink-0"
            style={{ backgroundColor: "#c0392b", color: "#fff" }}
            data-ocid="admin.ban_submit_button"
          >
            Ban
          </Button>
        </form>
      </div>

      {/* Bans list */}
      <h2
        className="font-mono text-sm font-bold mb-3"
        style={{ color: "#6b7280" }}
      >
        Active Bans ({bans.length})
      </h2>
      {bans.length === 0 ? (
        <p
          className="font-mono text-xs"
          style={{ color: "#9ca3af" }}
          data-ocid="admin.bans.empty_state"
        >
          No active bans.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#e5e7eb" }}>
              {["User ID", "Reason", "Banned", "Actions"].map((h) => (
                <TableHead
                  key={h}
                  className="font-mono text-xs uppercase"
                  style={{ color: "#9ca3af" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bans.map((ban, i) => (
              <TableRow
                key={ban.sessionId}
                style={{ borderColor: "#f3f4f6" }}
                data-ocid={`admin.ban.row.${i + 1}`}
              >
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#111827" }}
                >
                  {ban.sessionId}
                </TableCell>
                <TableCell className="text-sm" style={{ color: "#4b5563" }}>
                  {ban.reason}
                </TableCell>
                <TableCell
                  className="font-mono text-xs"
                  style={{ color: "#9ca3af" }}
                >
                  {timeAgo(backendApi.nsToMs(ban.timestamp))}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs px-2 py-1 rounded"
                    style={{ border: "1px solid #2563eb44", color: "#2563eb" }}
                    onClick={async () => {
                      await backendApi.unbanUser(ban.sessionId);
                      toast.success(`${ban.sessionId} unbanned`);
                      refresh();
                    }}
                    data-ocid="admin.ban.secondary_button"
                  >
                    Unban
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────
function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");

  const refresh = useCallback(async () => {
    const cats = await backendApi.getCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) {
      toast.error("Category name required");
      return;
    }
    await backendApi.addCategory(newCatName.trim());
    toast.success(`Category "${newCatName}" added`);
    setNewCatName("");
    refresh();
  }

  return (
    <div>
      {/* Add category form */}
      <div
        className="rounded p-4 mb-6"
        style={{ backgroundColor: "#f8f9fa", border: "1px solid #e5e7eb" }}
      >
        <h3
          className="font-mono text-xs uppercase tracking-wider mb-3"
          style={{ color: "#6b7280" }}
        >
          Add Category
        </h3>
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Category name..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="font-mono text-xs flex-1"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
            }}
            data-ocid="admin.add_category_input"
          />
          <Button
            type="submit"
            size="sm"
            className="font-mono text-xs uppercase shrink-0"
            style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
            data-ocid="admin.add_category_button"
          >
            Add
          </Button>
        </form>
      </div>

      {/* Category list */}
      <h2
        className="font-mono text-sm font-bold mb-3"
        style={{ color: "#6b7280" }}
      >
        Categories ({categories.length})
      </h2>
      <div className="space-y-2">
        {categories.map((cat, i) => (
          <div
            key={String(cat.id)}
            className="flex items-center justify-between px-3 py-2 rounded"
            style={{ backgroundColor: "#f8f9fa", border: "1px solid #f3f4f6" }}
            data-ocid={`admin.category.row.${i + 1}`}
          >
            <span className="font-mono text-sm" style={{ color: "#111827" }}>
              {cat.name}
            </span>
            <button
              type="button"
              className="font-mono text-xs px-2 py-1 rounded"
              style={{ border: "1px solid #c0392b44", color: "#c0392b" }}
              onClick={async () => {
                if (confirm(`Delete category "${cat.name}"?`)) {
                  await backendApi.deleteCategory(cat.id);
                  toast.success(`Category "${cat.name}" deleted`);
                  refresh();
                }
              }}
              data-ocid="admin.category.delete_button"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState<ThreadReport[]>([]);

  const refresh = useCallback(async () => {
    const r = await backendApi.getThreadReports();
    setReports(r.sort((a, b) => Number(b.createdAt - a.createdAt)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <h2
        className="font-mono text-sm font-bold mb-4"
        style={{ color: "#6b7280" }}
      >
        Thread Reports ({reports.length})
      </h2>
      {reports.length === 0 ? (
        <p
          className="font-mono text-xs"
          style={{ color: "#9ca3af" }}
          data-ocid="admin.reports.empty_state"
        >
          No reports yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: "#e5e7eb" }}>
                {["Thread ID", "Reporter", "Reason", "Time"].map((h) => (
                  <TableHead
                    key={h}
                    className="font-mono text-xs uppercase"
                    style={{ color: "#9ca3af" }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report, i) => (
                <TableRow
                  key={String(report.id)}
                  style={{ borderColor: "#f3f4f6" }}
                  data-ocid={`admin.report.row.${i + 1}`}
                >
                  <TableCell
                    className="font-mono text-xs"
                    style={{ color: "#111827" }}
                  >
                    #{String(report.threadId)}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs"
                    style={{ color: "#6b7280" }}
                  >
                    {report.reporterSessionId.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "#c0392b22",
                        color: "#c0392b",
                        border: "1px solid #c0392b44",
                      }}
                    >
                      {report.reason}
                    </span>
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs"
                    style={{ color: "#9ca3af" }}
                  >
                    {timeAgo(backendApi.nsToMs(report.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────
function AdminDashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <h1
          className="font-mono text-xl font-bold"
          style={{ color: "#2563eb" }}
        >
          {"//ADMIN"}
        </h1>
        <span
          className="font-mono text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: "#2563eb22",
            color: "#2563eb",
            border: "1px solid #2563eb44",
          }}
        >
          AUTHENTICATED
        </span>
      </div>

      <Tabs defaultValue="threads">
        <TabsList
          className="font-mono text-xs mb-6"
          style={{ backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb" }}
        >
          <TabsTrigger
            value="threads"
            className="font-mono text-xs uppercase tracking-wider"
            data-ocid="admin.threads_tab"
          >
            Threads
          </TabsTrigger>
          <TabsTrigger
            value="posts"
            className="font-mono text-xs uppercase tracking-wider"
            data-ocid="admin.posts_tab"
          >
            Posts
          </TabsTrigger>
          <TabsTrigger
            value="bans"
            className="font-mono text-xs uppercase tracking-wider"
            data-ocid="admin.bans_tab"
          >
            Bans
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="font-mono text-xs uppercase tracking-wider"
            data-ocid="admin.categories_tab"
          >
            Categories
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="font-mono text-xs uppercase tracking-wider"
            data-ocid="admin.reports_tab"
          >
            Reports
          </TabsTrigger>
        </TabsList>

        <div
          className="rounded p-4"
          style={{ backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb" }}
        >
          <TabsContent value="threads">
            <ThreadsTab />
          </TabsContent>
          <TabsContent value="posts">
            <PostsTab />
          </TabsContent>
          <TabsContent value="bans">
            <BansTab />
          </TabsContent>
          <TabsContent value="categories">
            <CategoriesTab />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);

  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}
