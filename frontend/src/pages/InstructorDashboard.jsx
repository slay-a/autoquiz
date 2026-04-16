import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Upload from "../components/Upload";
import { FileText, CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";

const API_BASE = "http://localhost:8000";

export default function InstructorDashboard() {
  const [files, setFiles] = useState([]);

  async function handleUpload(file) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE}/upload/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      body: form,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Upload failed");
    }

    const data = await res.json();
    setFiles((prev) => [{ ...data, filename: file.name }, ...prev]);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instructor Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Upload learning materials — PDFs, slides, or docs — to enable AI quiz generation.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Files" value={files.length} color="violet" />
        <StatCard
          label="Ready"
          value={files.filter((f) => f.status === "success").length}
          color="green"
        />
        <StatCard
          label="Processing"
          value={files.filter((f) => f.status === "in_progress" || f.status === "queued").length}
          color="amber"
        />
      </div>

      {/* Upload zone */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload New Material</h2>
        <Upload onUpload={handleUpload} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Uploaded Files</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {files.map((f) => (
              <FileRow key={f.job_id} file={f} onRetry={(updated) =>
                setFiles((prev) => prev.map((x) => x.job_id === f.job_id ? { ...x, ...updated } : x))
              } />
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No files uploaded yet</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    violet: "from-violet-50 to-violet-100/50 text-violet-700 border-violet-100",
    green: "from-emerald-50 to-emerald-100/50 text-emerald-700 border-emerald-100",
    amber: "from-amber-50 to-amber-100/50 text-amber-700 border-amber-100",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

function FileRow({ file, onRetry }) {
  const [status, setStatus] = useState(file.status);
  const [retrying, setRetrying] = useState(false);

  // Poll until terminal (GAP 5: moved to useEffect)
  useEffect(() => {
    if (status === "success" || status === "failed") return;
    const id = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(`${API_BASE}/upload/status/${file.job_id}`, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          if (data.status === "success" || data.status === "failed") clearInterval(id);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [file.job_id, status]);

  async function retry() {
    setRetrying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_BASE}/upload/retry/${file.job_id}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus("queued");
        onRetry(data);
      }
    } finally {
      setRetrying(false);
    }
  }

  return (
    <li className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
        <FileText className="w-4 h-4 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.filename}</p>
        <p className="text-xs text-gray-400">ID: {file.file_id?.slice(0, 8)}…</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        {status === "failed" && (
          <button
            onClick={retry}
            disabled={retrying}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
            Retry
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }) {
  const map = {
    queued:      { label: "Queued",      cls: "bg-gray-100 text-gray-500",    icon: <Clock className="w-3 h-3" /> },
    in_progress: { label: "Processing",  cls: "bg-blue-50 text-blue-600",     icon: <Clock className="w-3 h-3 animate-spin" /> },
    success:     { label: "Ready",       cls: "bg-emerald-50 text-emerald-600", icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:      { label: "Failed",      cls: "bg-red-50 text-red-500",       icon: <AlertCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.queued;
  return (
    <span className={`badge ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}
