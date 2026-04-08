import { useState } from "react";
import Upload from "../components/Upload";

export default function InstructorDashboard() {
  const [uploadedFiles, setUploadedFiles] = useState([]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Upload learning materials to enable quiz generation.</p>
      </div>

      <Upload onSuccess={(file) => setUploadedFiles((prev) => [file, ...prev])} />

      {uploadedFiles.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Uploaded Files</h2>
          <ul className="space-y-2">
            {uploadedFiles.map((f) => (
              <li
                key={f.job_id}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <span className="text-sm font-medium text-gray-700">{f.filename}</span>
                <JobStatusBadge jobId={f.job_id} initialStatus={f.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JobStatusBadge({ jobId, initialStatus }) {
  const [status, setStatus] = useState(initialStatus);

  // Poll for status updates until terminal state
  useState(() => {
    if (status === "success" || status === "failed") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/upload/status/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        if (data.status === "success" || data.status === "failed") {
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const colors = {
    queued: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-100 text-blue-700",
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${colors[status] ?? colors.queued}`}>
      {status.replace("_", " ")}
    </span>
  );
}
