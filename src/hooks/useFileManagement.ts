import { useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { computeOutputFileNames, processAllFiles, downloadAsZip } from '../utils/pdfProcessor';
import type { ProcessResult } from '../utils/pdfProcessor';
import { imageToPdf, isImageFile, isPdfFile } from '../utils/imageConverter';
import { isPdfLandscape } from '../utils/orientationDetector';
import type { StampPosition } from '../types';

export interface PreviewFileState {
  fileId: string;
  file: File;
  label: string;
  customOutputName?: string;
  groupId: string;
  customStampPosition?: StampPosition;
  rotation: 0 | 90 | 180 | 270;
}

export function useFileManagement() {
  const { groups, settings, addFiles, deleteFiles } = useStore();

  const [processing, setProcessing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFileName: '' });
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmFileNames, setConfirmFileNames] = useState<string[]>([]);
  const [processedResults, setProcessedResults] = useState<ProcessResult | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAiSplit, setShowAiSplit] = useState(false);
  const [aiSplitFile, setAiSplitFile] = useState<File | null>(null);
  const [showAiName, setShowAiName] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewFileState | null>(null);

  const isCustomSymbolEmpty = settings.symbol === 'custom' && !settings.customSymbol.trim();

  const totalFiles = groups.reduce((s, g) => s + 1 + g.branchFiles.length, 0);
  const totalSize = groups.reduce((s, g) => {
    let n = g.mainFile.file.size;
    g.branchFiles.forEach((f) => (n += f.file.size));
    return s + n;
  }, 0);

  const handleAddFiles = useCallback(async (rawFiles: File[]) => {
    setError(null);
    const acceptable = rawFiles.filter((f) => isPdfFile(f) || isImageFile(f));
    if (!acceptable.length) return;

    const images = acceptable.filter(isImageFile);
    const pdfs = acceptable.filter(isPdfFile);

    setConverting(true);
    try {
      const converted = await Promise.all(images.map(imageToPdf));
      const allPdfs = [...pdfs, ...converted];
      const withRotations = await Promise.all(
        allPdfs.map(async (file) => ({
          file,
          rotation: (await isPdfLandscape(file) ? 90 : 0) as 0 | 90,
        })),
      );
      addFiles(withRotations);
    } catch (err) {
      setError(err instanceof Error ? `ファイル処理失敗: ${err.message}` : 'ファイル処理中にエラーが発生しました');
    } finally {
      setConverting(false);
    }
  }, [addFiles]);

  const openFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length) handleAddFiles(files);
    };
    input.click();
  }, [handleAddFiles]);

  const openAiSplitPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length > 0) {
        setAiSplitFile(files[0]);
        setShowAiSplit(true);
      }
    };
    input.click();
  }, []);

  const handlePreviewSelect = useCallback((
    fileId: string, file: File, label: string, customOutputName?: string,
    groupId?: string, customStampPosition?: StampPosition,
    rotation?: 0 | 90 | 180 | 270,
  ) => {
    setPreviewFile(prev =>
      prev?.fileId === fileId ? null : {
        fileId, file, label, customOutputName,
        groupId: groupId ?? '',
        customStampPosition,
        rotation: rotation ?? 0,
      },
    );
  }, []);

  const handlePreviewReplaceFile = useCallback((newFile: File) => {
    if (!previewFile) return;
    const { replaceFile } = useStore.getState();
    for (const g of groups) {
      if (g.mainFile.id === previewFile.fileId) {
        replaceFile(g.id, g.mainFile.id, newFile);
        setPreviewFile({ ...previewFile, file: newFile });
        return;
      }
      const branch = g.branchFiles.find(f => f.id === previewFile.fileId);
      if (branch) {
        replaceFile(g.id, branch.id, newFile);
        setPreviewFile({ ...previewFile, file: newFile });
        return;
      }
    }
  }, [previewFile, groups]);

  const handlePreviewSplitFile = useCallback((file1: File, file2: File) => {
    if (!previewFile) return;
    const { splitFileIntoTwo } = useStore.getState();
    splitFileIntoTwo(previewFile.groupId, previewFile.fileId, file1, file2);
    setPreviewFile(null);
  }, [previewFile]);

  const toggleSelect = useCallback((fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    deleteFiles(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, deleteFiles]);

  const handleProcessClick = useCallback(() => {
    if (!groups.length) return;
    setConfirmFileNames(computeOutputFileNames(groups, settings));
    setShowConfirm(true);
  }, [groups, settings]);

  const handleConfirmProcess = useCallback(async () => {
    setShowConfirm(false);
    setProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 0, currentFileName: '' });
    try {
      const result = await processAllFiles(groups, settings, (cur, tot, fileName) =>
        setProgress({ current: cur, total: tot, currentFileName: fileName ?? '' }),
      );
      setProcessedResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理中にエラーが発生しました');
    } finally {
      setProcessing(false);
    }
  }, [groups, settings]);

  const handleDownloadZip = useCallback(async () => {
    if (!processedResults) return;
    await downloadAsZip(processedResults.files);
  }, [processedResults]);

  return {
    // state
    processing, converting, progress, error,
    selectionMode, setSelectionMode, selectedIds, setSelectedIds,
    showConfirm, setShowConfirm, confirmFileNames,
    processedResults, setProcessedResults,
    showClearConfirm, setShowClearConfirm,
    showAiSplit, setShowAiSplit, aiSplitFile, setAiSplitFile,
    showAiName, setShowAiName,
    previewFile, setPreviewFile,
    isCustomSymbolEmpty, totalFiles, totalSize,
    // actions
    handleAddFiles, openFilePicker, openAiSplitPicker,
    handlePreviewSelect, handlePreviewReplaceFile, handlePreviewSplitFile,
    toggleSelect, handleDeleteSelected,
    handleProcessClick, handleConfirmProcess, handleDownloadZip,
  };
}
