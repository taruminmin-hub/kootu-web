import { useState, useRef, useCallback, useEffect } from 'react';
import { createStampImage } from '../utils/stampUtils';
import { useStore } from '../store/useStore';
import type { StampPosition, Settings, StampColor } from '../types';

interface UseStampEditorOptions {
  label: string;
  customStampPosition?: StampPosition;
  settings: Settings;
  firstPageRef: React.RefObject<HTMLDivElement | null>;
  firstPageRect: { w: number; h: number };
  pdfSize: { w: number; h: number };
  onSavePosition: (pos: StampPosition) => void;
  onResetPosition: () => void;
}

export function useStampEditor({
  label, customStampPosition, settings,
  firstPageRef, firstPageRect, pdfSize,
  onSavePosition, onResetPosition,
}: UseStampEditorOptions) {
  const [pos, setPos] = useState<StampPosition>(
    customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop },
  );
  const [stampEditing, setStampEditing] = useState(false);
  const [posChanged, setPosChanged] = useState(false);
  const [stampColor, setStampColor] = useState<StampColor>(settings.color);
  const [stampFontSize, setStampFontSize] = useState(settings.fontSize);
  const [stampStyleChanged, setStampStyleChanged] = useState(false);

  // スタンプ画像
  const [stampPx, setStampPx] = useState({ w: 60, h: 20 });
  const [stampImageUrl, setStampImageUrl] = useState<string | null>(null);

  const scale = firstPageRect.w > 0 ? firstPageRect.w / pdfSize.w : 1;

  // スタンプ画像生成
  useEffect(() => {
    let cancelled = false;
    let prevUrl: string | null = null;
    createStampImage(label, stampFontSize, stampColor, settings.whiteBackground, settings.border)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        prevUrl = url;
        const img = new Image();
        img.onload = () => {
          if (cancelled) { URL.revokeObjectURL(url); return; }
          setStampPx({ w: img.width / 3, h: img.height / 3 });
          setStampImageUrl(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [label, stampFontSize, stampColor, settings.whiteBackground, settings.border]);

  // スタンプ位置ドラッグ
  const stampDragging = useRef(false);

  const updatePosFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!firstPageRef.current) return;
    const rect = firstPageRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const stampW = stampPx.w * scale;
    const stampH = stampPx.h * scale;
    const rightPx = rect.width - px - stampW / 2;
    const topPx = py - stampH / 2;
    setPos({
      marginRight: Math.max(0, Math.round(rightPx / scale)),
      marginTop: Math.max(0, Math.round(topPx / scale)),
    });
    setPosChanged(true);
  }, [scale, stampPx, firstPageRef]);

  const handleStampMouseDown = useCallback((e: React.MouseEvent) => {
    if (!stampEditing) return;
    stampDragging.current = true;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [stampEditing, updatePosFromEvent]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!stampDragging.current) return;
    updatePosFromEvent(e.clientX, e.clientY);
  }, [updatePosFromEvent]);

  const handleMouseUp = useCallback(() => { stampDragging.current = false; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const stampLeft = firstPageRect.w - (pos.marginRight + stampPx.w) * scale;
  const stampTop = pos.marginTop * scale;

  const handleSaveStamp = () => {
    onSavePosition(pos);
    if (stampStyleChanged) {
      const { updateSettings } = useStore.getState();
      updateSettings({ color: stampColor, fontSize: stampFontSize });
    }
    setPosChanged(false);
    setStampStyleChanged(false);
    setStampEditing(false);
  };

  const handleResetStamp = () => {
    const defaultPos = { marginRight: settings.marginRight, marginTop: settings.marginTop };
    setPos(defaultPos);
    setStampColor(settings.color);
    setStampFontSize(settings.fontSize);
    onResetPosition();
    setPosChanged(false);
    setStampStyleChanged(false);
    setStampEditing(false);
  };

  const handleCancelStamp = () => {
    setStampEditing(false);
    setPos(customStampPosition ?? { marginRight: settings.marginRight, marginTop: settings.marginTop });
    setStampColor(settings.color);
    setStampFontSize(settings.fontSize);
    setPosChanged(false);
    setStampStyleChanged(false);
  };

  const anyStampChanged = posChanged || stampStyleChanged;

  return {
    pos, stampEditing, setStampEditing,
    stampColor, setStampColor,
    stampFontSize, setStampFontSize,
    stampStyleChanged, setStampStyleChanged,
    stampPx, stampImageUrl, scale,
    stampLeft, stampTop,
    anyStampChanged,
    handleStampMouseDown,
    handleSaveStamp,
    handleResetStamp,
    handleCancelStamp,
  };
}
