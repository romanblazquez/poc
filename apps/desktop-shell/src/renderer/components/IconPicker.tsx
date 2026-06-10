/**
 * IconPicker — two-tab icon selector for AppDefinition.icon.
 *
 * Tab "Library": searchable Lucide grid → stores "lucide:IconName"
 * Tab "Upload":  PNG file → canvas crop box → base64 PNG → stores "data:image/png;base64,..."
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { AppIcon, LUCIDE_ICONS } from './AppIcon.js';
import { Upload, X } from 'lucide-react';

const ICON_NAMES = Object.keys(LUCIDE_ICONS).sort();
const OUTPUT_SIZE = 96; // px — stored at 96×96 retina-friendly

// ─── Lucide Library Tab ───────────────────────────────────────────────────────

function LibraryTab({ onSelect, color }: { onSelect: (val: string) => void; color: string }) {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()))
    : ICON_NAMES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons…"
        className="h-8 text-sm"
      />
      <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 4, alignContent: 'start' }}>
        {filtered.map((name) => (
          <button
            key={name}
            onClick={() => onSelect(`lucide:${name}`)}
            title={name}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, padding: '8px 4px', borderRadius: 6, border: '1px solid transparent',
              background: 'var(--shell-panel-2)', cursor: 'pointer', transition: 'border-color 0.1s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--shell-accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
          >
            <AppIcon icon={`lucide:${name}`} iconColor={color || undefined} size={20} />
            <span style={{ fontSize: 9, color: 'var(--shell-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {name}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center', color: 'var(--shell-muted)', fontSize: 12 }}>
            No icons match "{query}"
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PNG Upload + Canvas Crop Tab ────────────────────────────────────────────

interface CropBox { x: number; y: number; size: number }
type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | null;

const MIN_CROP = 40;
const HANDLE_HIT = 12;

function UploadTab({ onSelect }: { onSelect: (val: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, size: 100 });
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; origCrop: CropBox } | null>(null);

  const drawCropOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Dim outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const { x, y, size } = crop;
    ctx.fillRect(0, 0, canvas.width, y);
    ctx.fillRect(0, y, x, size);
    ctx.fillRect(x + size, y, canvas.width - x - size, size);
    ctx.fillRect(0, y + size, canvas.width, canvas.height - y - size);

    // Crop border
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.75;
    const third = size / 3;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x + third * i, y); ctx.lineTo(x + third * i, y + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + third * i); ctx.lineTo(x + size, y + third * i); ctx.stroke();
    }

    // Corner handles
    const handles = [
      { cx: x, cy: y }, { cx: x + size, cy: y },
      { cx: x + size, cy: y + size }, { cx: x, cy: y + size },
    ];
    ctx.fillStyle = 'white';
    for (const h of handles) {
      ctx.beginPath(); ctx.arc(h.cx, h.cy, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Update preview
    const preview = previewRef.current;
    if (preview) {
      const pCtx = preview.getContext('2d')!;
      const scaleX = img.naturalWidth / canvas.width;
      const scaleY = img.naturalHeight / canvas.height;
      pCtx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      pCtx.drawImage(
        img,
        x * scaleX, y * scaleY, size * scaleX, size * scaleY,
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
      );
    }
  }, [crop]);

  useEffect(() => { drawCropOverlay(); }, [drawCropOverlay]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const container = containerRef.current;
      if (!container) return;
      // Scale image to fit container (max 480×340)
      const maxW = Math.min(480, container.clientWidth || 480);
      const maxH = 340;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      setImgSize({ w, h });
      const size = Math.min(w, h) * 0.7;
      setCrop({ x: (w - size) / 2, y: (h - size) / 2, size });
      setImageSrc(url);
    };
    img.src = url;
    e.target.value = '';
  };

  const hitTest = (px: number, py: number, c: CropBox): DragMode => {
    const { x, y, size } = c;
    const corners: [number, number, DragMode][] = [
      [x, y, 'nw'], [x + size, y, 'ne'], [x + size, y + size, 'se'], [x, y + size, 'sw'],
    ];
    for (const [cx, cy, mode] of corners) {
      if (Math.hypot(px - cx, py - cy) <= HANDLE_HIT) return mode;
    }
    if (px >= x && px <= x + size && py >= y && py <= y + size) return 'move';
    return null;
  };

  const clampCrop = (next: CropBox, W: number, H: number): CropBox => {
    const size = Math.max(MIN_CROP, Math.min(next.size, W, H));
    const x = Math.max(0, Math.min(next.x, W - size));
    const y = Math.max(0, Math.min(next.y, H - size));
    return { x, y, size };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mode = hitTest(px, py, crop);
    if (!mode) return;
    e.preventDefault();
    dragRef.current = { mode, startX: px, startY: py, origCrop: { ...crop } };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - drag.startX;
      const dy = py - drag.startY;
      const { origCrop: o } = drag;
      const W = canvas.width;
      const H = canvas.height;
      let next: CropBox;
      if (drag.mode === 'move') {
        next = clampCrop({ x: o.x + dx, y: o.y + dy, size: o.size }, W, H);
      } else {
        // Resize: keep opposite corner fixed, use the larger delta as 1:1 size
        const delta = (Math.abs(dx) + Math.abs(dy)) / 2;
        let newSize = o.size;
        let newX = o.x;
        let newY = o.y;
        if (drag.mode === 'se') {
          newSize = Math.max(MIN_CROP, o.size + (dx + dy) / 2);
        } else if (drag.mode === 'nw') {
          newSize = Math.max(MIN_CROP, o.size - (dx + dy) / 2);
          newX = o.x + o.size - newSize;
          newY = o.y + o.size - newSize;
        } else if (drag.mode === 'ne') {
          newSize = Math.max(MIN_CROP, o.size + (dx - dy) / 2);
          newY = o.y + o.size - newSize;
        } else if (drag.mode === 'sw') {
          newSize = Math.max(MIN_CROP, o.size + (-dx + dy) / 2);
          newX = o.x + o.size - newSize;
        }
        void delta;
        next = clampCrop({ x: newX, y: newY, size: newSize }, W, H);
      }
      setCrop(next);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const generate = () => {
    const preview = previewRef.current;
    if (!preview) return;
    const dataUrl = preview.toDataURL('image/png');
    onSelect(dataUrl);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {!imageSrc ? (
        <label style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, border: '2px dashed var(--shell-border)', borderRadius: 10, cursor: 'pointer',
          color: 'var(--shell-muted)',
        }}>
          <Upload size={32} style={{ opacity: 0.5 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Click to upload a PNG or JPG</span>
          <span style={{ fontSize: 11 }}>Will be cropped and stored as base64 — shareable in the app directory</span>
          <input type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
        </label>
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, alignItems: 'flex-start' }}>
          {/* Canvas editor */}
          <div ref={containerRef} style={{ flex: 1, minWidth: 0 }}>
            <canvas
              ref={canvasRef}
              width={imgSize.w}
              height={imgSize.h}
              onMouseDown={onMouseDown}
              style={{ display: 'block', cursor: 'crosshair', borderRadius: 8, maxWidth: '100%' }}
            />
            <p style={{ fontSize: 10, color: 'var(--shell-muted)', marginTop: 6 }}>
              Drag to move · Drag corners to resize crop area
            </p>
          </div>

          {/* Preview + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 120, flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--shell-muted)', textTransform: 'uppercase' }}>Preview</span>
              {/* Circle preview */}
              <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--shell-border)' }}>
                <canvas ref={previewRef} width={OUTPUT_SIZE} height={OUTPUT_SIZE} style={{ width: 64, height: 64 }} />
              </div>
              {/* Square preview */}
              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--shell-border)' }}>
                <canvas width={OUTPUT_SIZE} height={OUTPUT_SIZE}
                  style={{ width: 48, height: 48 }}
                  ref={(el) => {
                    if (!el || !previewRef.current) return;
                    el.getContext('2d')?.drawImage(previewRef.current, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
                  }}
                />
              </div>
            </div>
            <Button size="sm" onClick={generate} className="w-full">Use icon</Button>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setImageSrc(null)}>
              Change image
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Color picker strip ───────────────────────────────────────────────────────

const COLOR_PRESETS = [
  '#ffffff', '#94a3b8', '#64748b',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6',
  '#8b5cf6', '#ec4899', '#f43f5e',
];

interface ColorStripProps {
  color: string;
  onChange: (c: string) => void;
}

function ColorStrip({ color, onChange }: ColorStripProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderTop: '1px solid var(--shell-border)', flexShrink: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--shell-muted)', textTransform: 'uppercase', marginRight: 4 }}>Color</span>
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: 18, height: 18, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', flexShrink: 0,
            outline: color === c ? `2px solid var(--shell-accent)` : '2px solid transparent',
            outlineOffset: 1,
          }}
        />
      ))}
      {/* Native color picker for full spectrum */}
      <label title="Custom color" style={{ position: 'relative', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', border: '2px dashed var(--shell-border)',
          background: COLOR_PRESETS.includes(color) ? 'transparent' : color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: 'var(--shell-muted)',
        }}>
          {COLOR_PRESETS.includes(color) ? '+' : ''}
        </div>
        <input
          type="color"
          value={color || '#3b82f6'}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>
      {color && (
        <button
          onClick={() => onChange('')}
          title="Remove color"
          style={{ fontSize: 10, color: 'var(--shell-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        >
          ✕
        </button>
      )}
      {/* Live preview */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--shell-muted)' }}>Preview</span>
        <div style={{
          width: 28, height: 28, borderRadius: 6, border: '1px solid var(--shell-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--shell-panel-2)',
        }}>
          <span style={{ fontSize: 14, color: color || 'inherit' }}>✦</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Picker Component ────────────────────────────────────────────────────

interface IconPickerProps {
  value?: string | null;
  color?: string | null;
  onChange: (val: string, color: string) => void;
  fallback?: string;
}

export function IconPicker({ value, color, onChange, fallback = '?' }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [pendingColor, setPendingColor] = useState(color ?? '');

  // Sync pendingColor when modal opens
  const openModal = () => { setPendingColor(color ?? ''); setOpen(true); };

  const select = (val: string) => {
    onChange(val, pendingColor);
    setOpen(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Preview button */}
      <button
        onClick={openModal}
        title="Change icon"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 8, border: '1px solid var(--shell-border)',
          background: 'var(--shell-panel-2)', cursor: 'pointer',
        }}
      >
        <AppIcon icon={value} iconColor={color} fallback={fallback} size={20} />
      </button>
      <button
        onClick={openModal}
        style={{ fontSize: 11, color: 'var(--shell-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
      >
        Change icon
      </button>
      {value && (
        <button
          onClick={() => onChange('', '')}
          title="Remove icon"
          style={{ fontSize: 11, color: 'var(--shell-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ✕
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(5,8,13,0.6)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 620, maxWidth: '95vw', height: 560, maxHeight: '90vh',
              background: 'var(--shell-panel)', border: '1px solid var(--shell-border)',
              borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--shell-border)', gap: 8, flexShrink: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--shell-text)', flex: 1 }}>Pick Icon</span>
              {(['library', 'upload'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: tab === t ? 'var(--shell-accent)' : 'var(--shell-panel-2)',
                    color: tab === t ? '#fff' : 'var(--shell-muted)',
                  }}
                >
                  {t === 'library' ? 'Icon Library' : 'Upload Image'}
                </button>
              ))}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--shell-muted)', padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, minHeight: 0, padding: 14, overflow: 'hidden' }}>
              {tab === 'library'
                ? <LibraryTab onSelect={select} color={pendingColor} />
                : <UploadTab onSelect={select} />
              }
            </div>

            {/* Color strip — always visible */}
            <ColorStrip color={pendingColor} onChange={setPendingColor} />
          </div>
        </div>
      )}
    </div>
  );
}
