'use client';

import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { Sparkles, UploadCloud, FileImage, X, Download, Loader2, Wand2, RotateCcw } from 'lucide-react';

const API_BASE = 'http://localhost:8000/files';
const IMG_PROC_BASE = 'http://localhost:8000/img-processing';

interface S3File { key: string; size: number; last_modified: string; url?: string; }
interface ToastMessage { id: string; message: string; type: 'success' | 'error' | 'info'; }

type UploadStatus = 'idle' | 'generating' | 'uploading' | 'complete' | 'error';
type JobStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface JobState {
  status: JobStatus;
  progress: number;
  progressLabel: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function cleanFilename(key: string) {
  const parts = key.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : key;
}

const statusLabel: Record<string, string> = {
  starting: 'Starting…',
  removing_background: 'Removing background…',
  saving: 'Saving…',
  completed: 'Done!',
  failed: 'Failed',
};

async function deleteKey(key: string) {
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch { /* best-effort */ }
}

// ─── component ──────────────────────────────────────────────────────────────

export default function Home() {
  // Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Session images
  const [original, setOriginal] = useState<S3File | null>(null);
  // We keep a snapshot of the original URL for the side-by-side view after the
  // original S3 object is deleted.
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [processed, setProcessed] = useState<S3File | null>(null);

  // Job
  const [job, setJob] = useState<JobState>({ status: 'idle', progress: 0, progressLabel: '' });
  const esRef = useRef<EventSource | null>(null);

  // UI
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Toast helpers ──────────────────────────────────────────────────────────

  const addToast = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  };

  // ── Cleanup: wipe all bucket files on mount (previous sessions), and on
  //    page unload (current session). ─────────────────────────────────────────

  useEffect(() => {
    // Wipe any leftover files from previous sessions on mount
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        await Promise.all((data.files as S3File[]).map(f => deleteKey(f.key)));
      } catch { /* ignore */ }
    })();
  }, []);

  // Store refs to current keys so the beforeunload listener always has the
  // latest values without needing to be re-registered.
  const originalKeyRef = useRef<string | null>(null);
  const processedKeyRef = useRef<string | null>(null);

  useEffect(() => { originalKeyRef.current = original?.key ?? null; }, [original]);
  useEffect(() => { processedKeyRef.current = processed?.key ?? null; }, [processed]);

  useEffect(() => {
    const onUnload = () => {
      // fetch with keepalive:true is the correct way to fire DELETE on unload
      // (sendBeacon always sends POST and cannot be used for DELETE endpoints)
      if (originalKeyRef.current)
        fetch(`${API_BASE}/${encodeURIComponent(originalKeyRef.current)}`, { method: 'DELETE', keepalive: true });
      if (processedKeyRef.current)
        fetch(`${API_BASE}/${encodeURIComponent(processedKeyRef.current)}`, { method: 'DELETE', keepalive: true });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragActive(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) { addToast('Please select an image file', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { addToast('File size exceeds 10 MB', 'error'); return; }
    startUpload(file);
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const startUpload = async (file: File) => {
    setSelectedFile(file);
    setUploadStatus('generating');
    setUploadProgress(5);
    setUploadError('');

    try {
      const urlRes = await fetch(`${API_BASE}/upload-url?filename=${encodeURIComponent(file.name)}`);
      if (!urlRes.ok) throw new Error('Failed to generate upload URL.');
      const urlData = await urlRes.json();
      if (!urlData.success || !urlData.upload_url || !urlData.key)
        throw new Error(urlData.message || 'URL generation failed.');

      const { upload_url: uploadUrl, key } = urlData;
      setUploadStatus('uploading');
      setUploadProgress(15);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = e => {
          if (e.lengthComputable)
            setUploadProgress(Math.round((e.loaded / e.total) * 85) + 15);
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      setUploadProgress(100);
      setUploadStatus('complete');

      // Fetch preview URL
      const dlRes = await fetch(`${API_BASE}/download-url/${encodeURIComponent(key)}`);
      const dlData = dlRes.ok ? await dlRes.json() : {};
      const previewUrl = dlData.success ? dlData.download_url : undefined;

      const newFile: S3File = { key, size: file.size, last_modified: new Date().toISOString(), url: previewUrl };
      setOriginal(newFile);
      setOriginalPreviewUrl(previewUrl ?? null);
      setJob({ status: 'idle', progress: 0, progressLabel: '' });
      addToast('Image uploaded — ready to remove background', 'success');
      setTimeout(() => { setSelectedFile(null); setUploadStatus('idle'); setUploadProgress(0); }, 800);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadError(err.message || 'Upload failed');
      addToast(err.message || 'Upload failed', 'error');
    }
  };

  // ── Background removal ────────────────────────────────────────────────────

  const handleRemoveBg = async () => {
    if (!original || job.status === 'processing') return;

    setJob({ status: 'processing', progress: 0, progressLabel: 'Queuing…' });

    try {
      const res = await fetch(`${IMG_PROC_BASE}/remove-bg?key=${encodeURIComponent(original.key)}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start job');
      const data = await res.json();
      if (!data.success || !data.job_id) throw new Error('Invalid server response');

      addToast('Background removal started', 'info');

      esRef.current?.close();
      const es = new EventSource(`${IMG_PROC_BASE}/job-status/${data.job_id}`);
      esRef.current = es;

      es.onmessage = async (event) => {
        const { progress, status, output_key } = JSON.parse(event.data);

        if (status === 'completed' && output_key) {
          es.close(); esRef.current = null;

          // Fetch processed image URL
          let processedUrl: string | undefined;
          try {
            const r = await fetch(`${API_BASE}/download-url/${encodeURIComponent(output_key)}`);
            if (r.ok) { const d = await r.json(); if (d.success) processedUrl = d.download_url; }
          } catch { /* ignore */ }

          // Delete original from S3 — we already have originalPreviewUrl locally
          if (original) {
            await deleteKey(original.key);
            setOriginal(null); // cleared from state; URL snapshot stays in originalPreviewUrl
          }

          setProcessed({ key: output_key, size: 0, last_modified: new Date().toISOString(), url: processedUrl });
          setJob({ status: 'completed', progress: 100, progressLabel: 'Done!' });
          addToast('Background removed!', 'success');

        } else if (status === 'failed') {
          es.close(); esRef.current = null;
          setJob({ status: 'failed', progress: 0, progressLabel: 'Failed' });
          addToast('Background removal failed', 'error');

        } else {
          setJob(p => ({
            status: 'processing',
            progress: progress ?? p.progress,
            progressLabel: statusLabel[status] ?? status,
          }));
        }
      };

      es.onerror = () => {
        es.close(); esRef.current = null;
        // Only show error if we haven't already completed
        setJob(p => p.status === 'processing'
          ? { status: 'failed', progress: 0, progressLabel: 'Connection error' }
          : p
        );
        if (job.status === 'processing') addToast('Lost connection to job stream', 'error');
      };

    } catch (err: any) {
      setJob({ status: 'failed', progress: 0, progressLabel: 'Failed to start' });
      addToast(err.message || 'Failed to start removal', 'error');
    }
  };

  // ── Start over ────────────────────────────────────────────────────────────

  const handleStartOver = async () => {
    esRef.current?.close(); esRef.current = null;
    if (original) await deleteKey(original.key);
    if (processed) await deleteKey(processed.key);
    setOriginal(null);
    setOriginalPreviewUrl(null);
    setProcessed(null);
    setJob({ status: 'idle', progress: 0, progressLabel: '' });
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derived booleans ──────────────────────────────────────────────────────

  const isUploading = uploadStatus === 'generating' || uploadStatus === 'uploading';
  const isProcessing = job.status === 'processing';
  const isComparison = job.status === 'completed' && !!processed?.url;
  const showDropzone = !selectedFile && !original && !isComparison;
  const showOrigPreview = !!original && job.status === 'idle';

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────

  const styles = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Fonts loaded via layout.tsx — no @import needed here */

    :root {
      --bg:          #f7f6f4;
      --surface:     #ffffff;
      --surface-2:   #f2f0ed;
      --border:      #e8e4df;
      --border-h:    #d4cfc9;
      --text:        #1c1917;
      --text-2:      #6b6460;
      --text-3:      #a8a29e;
      --accent:      #b45309;
      --accent-bg:   #fef3c7;
      --accent-dim:  rgba(180,83,9,0.08);
      --red:         #dc2626;
      --red-dim:     rgba(220,38,38,0.08);
      --green:       #16a34a;
      --green-dim:   rgba(22,163,74,0.08);
      --blue:        #2563eb;
      --blue-dim:    rgba(37,99,235,0.08);
      --radius:      12px;
      --radius-sm:   8px;
      --shadow-sm:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
      --shadow:      0 4px 16px rgba(0,0,0,0.08);
      --shadow-lg:   0 16px 48px rgba(0,0,0,0.14);
      --font-display:'DM Serif Display', Georgia, serif;
      --font-body:   'DM Sans', system-ui, sans-serif;
      --transition:  0.18s cubic-bezier(0.4,0,0.2,1);
    }

    html, body { height: 100%; }
    body {
      font-family: var(--font-body);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Shell ── */
    .shell { display: flex; flex-direction: column; min-height: 100vh; }
    .app   { flex: 1; max-width: 960px; margin: 0 auto; padding: 0 28px; width: 100%; }

    /* ── Header ── */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 24px 0 22px; border-bottom: 1px solid var(--border);
    }
    .header-brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark {
      width: 40px; height: 40px; border-radius: 10px;
      background: var(--accent-bg); border: 1px solid #fde68a;
      display: flex; align-items: center; justify-content: center;
      color: var(--accent);
    }
    .brand-name  { font-family: var(--font-display); font-size: 1.25rem; color: var(--text); letter-spacing: -0.02em; }
    .brand-sub   { font-size: 0.75rem; color: var(--text-3); margin-top: 1px; }

    /* ── Stage area ── */
    .stage { padding: 40px 0 60px; display: flex; flex-direction: column; align-items: center; gap: 28px; }

    /* ── Dropzone ── */
    .dropzone {
      border: 1.5px dashed var(--border-h); border-radius: var(--radius);
      padding: 60px 24px;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      cursor: pointer; text-align: center; width: 100%; max-width: 520px;
      background: var(--surface-2); transition: all var(--transition);
    }
    .dropzone:hover, .dropzone.active { border-color: var(--accent); background: var(--accent-dim); }
    .dropzone-icon {
      width: 56px; height: 56px; border-radius: 14px;
      background: var(--surface); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      color: var(--accent);
    }
    .dropzone-title { font-family: var(--font-display); font-size: 1.1rem; color: var(--text); }
    .dropzone-text  { font-size: 0.82rem; color: var(--text-2); line-height: 1.55; }
    .dropzone-link  { color: var(--accent); font-weight: 500; text-decoration: underline; text-underline-offset: 2px; }
    .dropzone-hint  { font-size: 0.71rem; color: var(--text-3); }

    /* ── Upload progress ── */
    .upload-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow-sm); overflow: hidden; width: 100%; max-width: 520px;
    }
    .upload-file-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; background: var(--surface-2);
    }
    .upload-file-info { flex: 1; min-width: 0; }
    .upload-file-name { font-size: 0.85rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .upload-file-size { font-size: 0.72rem; color: var(--text-3); margin-top: 1px; }
    .upload-progress-area { padding: 12px 16px; }
    .progress-track { height: 3px; border-radius: 2px; background: var(--border); overflow: hidden; margin-bottom: 7px; }
    .progress-fill  { height: 100%; border-radius: 2px; background: var(--accent); transition: width 0.3s ease; }
    .progress-fill.fill-success { background: var(--green); }
    .progress-fill.fill-error   { background: var(--red); }
    .progress-label { font-size: 0.73rem; color: var(--text-3); }

    /* ── Single image preview (before removal) ── */
    .preview-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: var(--shadow-sm); overflow: hidden; width: 100%; max-width: 520px;
    }
    .preview-img-wrap { position: relative; }
    .preview-img      { width: 100%; display: block; max-height: 380px; object-fit: contain; background: var(--surface-2); }
    .preview-footer   {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px; border-top: 1px solid var(--border);
      flex-wrap: wrap; gap: 10px;
    }
    .preview-meta  { font-size: 0.78rem; color: var(--text-3); }

    /* ── Job progress bar (inside preview card) ── */
    .job-bar { padding: 10px 16px 0; }
    .job-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.73rem; color: var(--text-2); margin-top: 6px;
    }

    /* ── Side-by-side comparison ── */
    .compare-wrap { width: 100%; }
    .compare-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .compare-title { font-family: var(--font-display); font-size: 1.05rem; color: var(--text); }
    .compare-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 600px) { .compare-grid { grid-template-columns: 1fr; } }

    .compare-panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm);
    }
    .compare-panel-label {
      padding: 10px 14px; font-size: 0.73rem; font-weight: 500; letter-spacing: 0.04em;
      text-transform: uppercase; color: var(--text-3); border-bottom: 1px solid var(--border);
    }
    .compare-panel-label.label-processed { color: var(--green); }
    .compare-img   { width: 100%; display: block; object-fit: contain; background: var(--surface-2); }
    .compare-img.checkerboard {
      background-image: repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%);
      background-size: 18px 18px;
    }
    .compare-download {
      display: flex; padding: 12px 14px; border-top: 1px solid var(--border);
    }

    /* ── Buttons ── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: var(--font-body); font-size: 0.8rem; font-weight: 500;
      padding: 8px 16px; border-radius: var(--radius-sm);
      border: 1px solid transparent; cursor: pointer;
      transition: all var(--transition); white-space: nowrap;
      text-decoration: none; line-height: 1;
    }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-accent  { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-accent:hover:not(:disabled) { background: #92400e; border-color: #92400e; }
    .btn-ghost   { background: var(--surface); border-color: var(--border); color: var(--text-2); }
    .btn-ghost:hover:not(:disabled)  { border-color: var(--border-h); color: var(--text); }
    .btn-icon {
      width: 32px; height: 32px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--surface); border: 1px solid var(--border); color: var(--text-3);
      border-radius: var(--radius-sm); cursor: pointer; transition: all var(--transition);
    }
    .btn-icon:hover { border-color: var(--border-h); color: var(--text); }
    .btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Spinner ── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 0.9s linear infinite; }

    /* ── Toasts ── */
    .toast-stack { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; flex-direction: column; gap: 8px; }
    .toast {
      display: flex; align-items: center; gap: 9px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 11px 13px;
      box-shadow: var(--shadow); min-width: 240px; max-width: 320px;
      font-size: 0.8rem; color: var(--text);
      animation: toastIn 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes toastIn { from { transform: translateX(16px); opacity: 0; } to { transform: none; opacity: 1; } }
    .toast-success .toast-dot { background: var(--green); }
    .toast-error   .toast-dot { background: var(--red); }
    .toast-info    .toast-dot { background: var(--blue); }
    .toast-dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .toast-msg   { flex: 1; }
    .toast-close { background: none; border: none; cursor: pointer; color: var(--text-3); padding: 0; display: flex; line-height: 1; }
    .toast-close:hover { color: var(--text); }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid var(--border); padding: 18px 28px;
      text-align: center; font-size: 0.73rem; color: var(--text-3);
      background: var(--surface); margin-top: auto;
    }
  `;

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="shell">
        <div className="app">

          {/* Header */}
          <header className="header">
            <div className="header-brand">
              <div className="brand-mark"><Sparkles size={19} /></div>
              <div>
                <div className="brand-name">Photo BG Remover</div>
                <div className="brand-sub">Remove backgrounds instantly with AI</div>
              </div>
            </div>
            {(original || isComparison) && (
              <button className="btn btn-ghost" onClick={handleStartOver}>
                <RotateCcw size={13} /> Start Over
              </button>
            )}
          </header>

          {/* Stage */}
          <main className="stage">

            {/* ── Step 1: Dropzone ── */}
            {showDropzone && (
              <div
                className={`dropzone${dragActive ? ' active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file" ref={fileInputRef}
                  onChange={handleFileChange} accept="image/*"
                  style={{ display: 'none' }}
                  onClick={e => e.stopPropagation()}
                />
                <div className="dropzone-icon"><UploadCloud size={24} /></div>
                <div className="dropzone-title">Upload your photo</div>
                <div className="dropzone-text">
                  Drop your image here or{' '}
                  <span className="dropzone-link">browse files</span>
                </div>
                <div className="dropzone-hint">JPG · PNG · WEBP · Max 10 MB</div>
              </div>
            )}

            {/* ── Uploading indicator ── */}
            {selectedFile && uploadStatus !== 'idle' && (
              <div className="upload-card">
                <div className="upload-file-bar">
                  <FileImage size={16} color="var(--accent)" />
                  <div className="upload-file-info">
                    <div className="upload-file-name">{selectedFile.name}</div>
                    <div className="upload-file-size">{formatBytes(selectedFile.size)}</div>
                  </div>
                  {!isUploading && (
                    <button
                      className="btn-icon"
                      onClick={() => { setSelectedFile(null); setUploadStatus('idle'); }}
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="upload-progress-area">
                  <div className="progress-track">
                    <div
                      className={`progress-fill${uploadStatus === 'complete' ? ' fill-success' : uploadStatus === 'error' ? ' fill-error' : ''}`}
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="progress-label">
                    {uploadStatus === 'generating' && 'Generating secure URL…'}
                    {uploadStatus === 'uploading' && `Uploading… ${uploadProgress}%`}
                    {uploadStatus === 'complete' && 'Upload complete ✓'}
                    {uploadStatus === 'error' && (uploadError || 'Upload failed')}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Original preview + Remove BG button ── */}
            {showOrigPreview && original?.url && (
              <div className="preview-card">
                <div className="preview-img-wrap">
                  <img src={original.url} alt={cleanFilename(original.key)} className="preview-img" />
                </div>
                <div className="preview-footer">
                  <span className="preview-meta">{cleanFilename(original.key)}</span>
                  <button className="btn btn-accent" onClick={handleRemoveBg}>
                    <Wand2 size={14} /> Remove Background
                  </button>
                </div>
              </div>
            )}

            {/* ── Processing state: show original + progress ── */}
            {isProcessing && original?.url && (
              <div className="preview-card">
                <img src={original.url} alt="Original" className="preview-img" />
                <div className="job-bar">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                  <div className="job-label">
                    <Loader2 size={12} className="spin" />
                    {job.progressLabel || 'Processing…'}
                  </div>
                </div>
                <div className="preview-footer">
                  <span className="preview-meta">AI is removing the background…</span>
                </div>
              </div>
            )}

            {/* ── Job failed ── */}
            {job.status === 'failed' && original?.url && (
              <div className="preview-card">
                <img src={original.url} alt="Original" className="preview-img" />
                <div className="preview-footer">
                  <span className="preview-meta" style={{ color: 'var(--red)' }}>
                    Background removal failed.
                  </span>
                  <button className="btn btn-accent" onClick={handleRemoveBg}>
                    <Wand2 size={14} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Side-by-side comparison ── */}
            {isComparison && (
              <div className="compare-wrap">
                <div className="compare-header">
                  <div className="compare-title">✨ Background Removed</div>
                </div>
                <div className="compare-grid">
                  {/* Original panel */}
                  <div className="compare-panel">
                    <div className="compare-panel-label">Original</div>
                    {originalPreviewUrl && (
                      <img src={originalPreviewUrl} alt="Original" className="compare-img" />
                    )}
                  </div>

                  {/* Processed panel */}
                  <div className="compare-panel">
                    <div className="compare-panel-label label-processed">Background Removed</div>
                    {processed?.url && (
                      <img src={processed.url} alt="Processed" className="compare-img checkerboard" />
                    )}
                    {processed?.url && (
                      <div className="compare-download">
                        <a
                          href={processed.url}
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const res = await fetch(processed.url!);
                              const blob = await res.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = blobUrl;
                              a.download = cleanFilename(processed.key);
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                              window.open(processed.url, '_blank');
                            }
                          }}
                          className="btn btn-accent"
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          <Download size={14} /> Download PNG
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>

        <footer className="footer">
          Photo BG Remover &copy; 2026 &middot; Powered by FastAPI &amp; Floci S3
        </footer>
      </div>

      {/* Toasts */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div className="toast-dot" />
            <div className="toast-msg">{t.message}</div>
            <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}