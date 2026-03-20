import { useRef, useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";

/**
 * Drag-and-drop file upload zone.
 * Props:
 *   accept       — file extensions string like ".csv,.json"
 *   onFile       — callback(File)
 *   label        — primary label
 *   sublabel     — secondary hint
 *   disabled     — bool
 *   uploading    — bool — shows spinner, blocks interaction
 *   error        — string — shown in red below the zone
 */
export default function FileDropZone({ accept, onFile, label, sublabel, disabled, uploading, error }) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef(null);

  const isDisabled = disabled || uploading;

  const validateAndSet = (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    const accepted = accept
      ? accept.split(",").map((a) => a.trim().toLowerCase())
      : [];

    if (accepted.length > 0 && !accepted.includes(ext)) {
      setLocalError("Only .csv and .json files are accepted.");
      return;
    }
    setLocalError("");
    setSelectedFile(file);
    onFile(file);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    if (!isDisabled) setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };
  const onDragOver = (e) => {
    e.preventDefault();
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (isDisabled) return;
    const file = e.dataTransfer.files?.[0];
    validateAndSet(file);
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSet(file);
    e.target.value = "";
  };

  const onClear = () => {
    setSelectedFile(null);
    setLocalError("");
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const baseZone = [
    "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-6 py-8 text-center transition-all",
    dragging
      ? "border-primary bg-primary/5"
      : "border-dashed border-muted-foreground/30 bg-muted/30",
    isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/60",
  ].join(" ");

  return (
    <div>
      <div
        className={baseZone}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => !isDisabled && !selectedFile && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onInputChange}
          disabled={isDisabled}
        />

        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Uploading…</p>
          </>
        ) : selectedFile ? (
          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{label || "Click or drag a file here"}</p>
              {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
            </div>
          </>
        )}
      </div>

      {(localError || error) && (
        <p className="mt-1.5 text-xs text-destructive">{localError || error}</p>
      )}
    </div>
  );
}
