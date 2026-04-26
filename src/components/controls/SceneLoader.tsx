import { useRef, useState } from 'react';
import { useSceneStore, ASSET_OPTIONS, type AssetKind } from '@/store/sceneStore';
import { validateGltfFile } from '@/lib/security/validateGltf';
import { ExportButton } from './ExportButton';

const UploadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4 L12 16" />
    <path d="M7 9 L12 4 L17 9" />
    <path d="M5 19 L19 19" />
  </svg>
);

export function SceneLoader() {
  const currentAsset = useSceneStore((s) => s.currentAsset);
  const setCurrentAsset = useSceneStore((s) => s.setCurrentAsset);
  const loadUploadedAsset = useSceneStore((s) => s.loadUploadedAsset);
  const uploadedAssetName = useSceneStore((s) => s.uploadedAssetName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setValidationError(null);
    const result = await validateGltfFile(file);
    if (!result.ok) {
      setValidationError(result.reason);
      setTimeout(() => setValidationError(null), 5000);
      return;
    }
    const url = URL.createObjectURL(file);
    loadUploadedAsset(url, file.name);
  };

  const isUploaded = currentAsset === 'uploaded';
  const selectValue: string = isUploaded ? '__uploaded' : currentAsset;

  return (
    <div className="bg-bg-panel/85 backdrop-blur-md border border-bg-border rounded-lg shadow-xl p-1.5 flex items-center gap-1.5">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === '__uploaded') return;
          setCurrentAsset(e.target.value as AssetKind);
        }}
        title={isUploaded ? uploadedAssetName ?? 'Uploaded asset' : 'Select asset'}
        className="bg-bg-panel border border-bg-border text-text text-[12px] rounded px-2 py-1.5 cursor-pointer min-w-[200px] focus:outline-none focus:border-accent/60"
      >
        {ASSET_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
        {isUploaded && (
          <option value="__uploaded">
            {uploadedAssetName ?? 'Uploaded'}
          </option>
        )}
      </select>
      <button
        onClick={() => inputRef.current?.click()}
        title={uploadedAssetName ?? 'Upload .glb / .gltf'}
        className={[
          'w-9 h-9 rounded-md flex items-center justify-center transition-all border border-dashed flex-shrink-0',
          isUploaded
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-bg-border bg-bg/40 text-text-muted hover:border-accent/60 hover:text-accent',
        ].join(' ')}
      >
        <span className="block w-5 h-5">{UploadIcon}</span>
      </button>
      <ExportButton compact />
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {validationError && (
        <span className="self-center text-[10px] text-bad bg-bad/10 border border-bad/30 rounded px-2 py-1 max-w-[260px]">
          {validationError}
        </span>
      )}
    </div>
  );
}
