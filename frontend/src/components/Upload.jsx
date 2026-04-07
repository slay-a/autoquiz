import { useState, useRef } from "react";
import { UploadCloud } from "lucide-react";

const ALLOWED = [".pdf", ".docx", ".pptx"];

export default function Upload({ onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  function validateFile(file) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED.includes(ext)) return `Unsupported type: ${ext}. Use PDF, DOCX, or PPTX.`;
    if (file.size > 50 * 1024 * 1024) return "File must be under 50MB.";
    return null;
  }

  async function handleUpload(file) {
    const err = validateFile(file);
    if (err) { setError(err); return; }

    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/upload/", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Upload failed");
      }
      const data = await res.json();
      onSuccess?.({ ...data, filename: file.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
        ${dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 bg-white"}`}
    >
      <UploadCloud className="w-10 h-10 text-gray-400" />
      <p className="text-sm font-medium text-gray-700">
        {uploading ? "Uploading..." : "Drag & drop or click to upload"}
      </p>
      <p className="text-xs text-gray-400">PDF, DOCX, PPTX — max 50MB</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
      />
    </div>
  );
}
