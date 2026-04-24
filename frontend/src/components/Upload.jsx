import { useState, useRef } from "react";
import { UploadCloud, FileText, X } from "lucide-react";

const ALLOWED = [".pdf", ".docx", ".pptx"];

export default function Upload({ onUpload, onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef();

  // Support both prop names for backward compatibility
  const uploadHandler = onUpload || onSuccess;

  function validate(file) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED.includes(ext)) return `Unsupported type "${ext}" — use PDF, DOCX, or PPTX`;
    if (file.size > 50 * 1024 * 1024) return "File must be under 50MB";
    return null;
  }

  async function handleFile(file) {
    const err = validate(file);
    if (err) { setError(err); return; }

    setError(null);
    setPreview({ name: file.name, size: (file.size / 1024 / 1024).toFixed(2) });
    setUploading(true);
    setProgress(10);

    try {
      // Simulate progress ticks
      const tick = setInterval(() => setProgress((p) => Math.min(p + 15, 85)), 400);

      // Call parent's upload handler
      await uploadHandler?.(file);

      clearInterval(tick);
      setProgress(100);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setPreview(null);
      }, 600);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-all duration-200 cursor-pointer
          ${dragging
            ? "border-violet-400 bg-violet-50 scale-[1.01]"
            : uploading
            ? "border-violet-300 bg-violet-50/50 cursor-default"
            : "border-gray-200 dark:border-slate-700 hover:border-violet-300 hover:bg-violet-50/30 bg-white dark:bg-slate-800"
          }`}
      >
        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
          ${dragging || uploading ? "bg-violet-100" : "bg-gray-50 dark:bg-slate-800"}`}>
          <UploadCloud className={`w-7 h-7 transition-colors
            ${dragging || uploading ? "text-violet-500" : "text-gray-400 dark:text-slate-500"}`} />
        </div>

        {/* Text */}
        {uploading && preview ? (
          <div className="text-center">
            <p className="text-sm font-medium text-violet-700">Uploading {preview.name}…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{preview.size} MB</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              {dragging ? "Drop it!" : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">PDF · DOCX · PPTX — up to 50MB</p>
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="w-full max-w-xs bg-violet-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.pptx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
