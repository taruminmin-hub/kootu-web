import React from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FileGroup, Settings } from '../types';
import { generateStampText, getSymbolText } from '../utils/stampUtils';
import { useStore } from '../store/useStore';
import FileCard from './FileCard';

interface Props {
  group: FileGroup;
  index: number;
  settings: Settings;
  isFirst: boolean;
  isLast: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (fileId: string) => void;
  draggingGroupId?: string | null;
  previewingFileId?: string | null;
  onPreviewSelect?: (fileId: string, file: File, label: string, customOutputName?: string, groupId?: string, customStampPosition?: import('../types').StampPosition, rotation?: 0 | 90 | 180 | 270) => void;
}

/** 枝番ファイルをドラッグで並び替えるためのラッパー */
function SortableBranchItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex flex-col"
    >
      <div
        {...attributes}
        {...listeners}
        className="h-3.5 mb-0.5 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 bg-gray-100 hover:bg-gray-200 rounded text-xs select-none"
        title="ドラッグで順序変更"
      >
        ⠿
      </div>
      {children}
    </div>
  );
}

export default function FileGroupRow({
  group, index, settings, isFirst, isLast,
  selectionMode, selectedIds, onToggleSelect,
  draggingGroupId, previewingFileId, onPreviewSelect,
}: Props) {
  const {
    removeGroup, removeBranch, makeBranch, makeMain,
    moveGroupUp, moveGroupDown,
    setCustomOutputName, setCustomStampPosition, setRotation,
    toggleMergeBranches, reorderBranchFiles,
    replaceFile, splitFileIntoTwo,
  } = useStore();

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: group.id });

  const dropId = `branch-drop-${group.id}`;
  const isDraggingOther = !!draggingGroupId && draggingGroupId !== group.id;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId, disabled: !isDraggingOther });

  const branchSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleBranchDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      reorderBranchFiles(group.id, String(active.id), String(over.id));
    }
  };

  const sym = getSymbolText(settings.symbol, settings.customSymbol);
  const mainNum = settings.startNumber + index;
  const hasBranches = group.branchFiles.length > 0;
  const nl = settings.numberless;
  const groupMerge = group.mergeBranches ?? settings.mergeBranches;

  const mainLabel = generateStampText(sym, mainNum, hasBranches ? 1 : null, settings.stampFormat, nl);
  const branchLabels = group.branchFiles.map((_, j) =>
    generateStampText(sym, mainNum, j + 2, settings.stampFormat, nl),
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-gray-50 border rounded-xl p-3 flex items-start gap-3 transition-colors ${
        isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
      }`}
    >
      {/* 枝番ドロップゾーン（別グループをドラッグ中のみ表示） */}
      {isDraggingOther && (
        <div
          ref={setDropRef}
          className={`absolute inset-0 rounded-xl z-10 flex items-center justify-center pointer-events-auto transition-colors ${
            isOver
              ? 'bg-blue-100/80 border-2 border-blue-500'
              : 'bg-transparent border-2 border-dashed border-blue-300'
          }`}
        >
          {isOver && (
            <span className="text-blue-700 font-bold text-sm bg-white/90 px-3 py-1 rounded-full shadow">
              枝番として追加
            </span>
          )}
        </div>
      )}
      {/* ドラッグハンドル＋番号バッジ */}
      <div className="flex flex-col items-center gap-1 shrink-0 w-14">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 text-lg select-none"
          title="ドラッグで並び替え"
        >
          ⠿
        </div>
        <div className="w-10 h-10 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-sm font-bold text-gray-700">
          {nl ? sym : mainNum}
        </div>
        <div className="flex gap-0.5">
          <button
            onClick={() => moveGroupUp(group.id)}
            disabled={isFirst}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 px-0.5"
            title="上へ"
          >▲</button>
          <button
            onClick={() => moveGroupDown(group.id)}
            disabled={isLast}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 px-0.5"
            title="下へ"
          >▼</button>
        </div>
        {hasBranches && (
          <button
            onClick={() => toggleMergeBranches(group.id)}
            className={`text-[10px] font-medium rounded px-1 py-0.5 w-full text-center ${
              groupMerge
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={groupMerge ? '枝番を結合して1ファイルに出力中（クリックで解除）' : 'クリックで枝番を1ファイルに結合'}
          >
            {groupMerge ? '結合中' : '結合'}
          </button>
        )}
      </div>

      {/* ファイルカード群（横並び） */}
      <div className="flex flex-wrap gap-2 flex-1 items-start">
        {/* メインファイル */}
        <FileCard
          label={mainLabel}
          file={group.mainFile.file}
          customOutputName={group.mainFile.customOutputName}
          customStampPosition={group.mainFile.customStampPosition}
          rotation={group.mainFile.rotation}
          isBranch={false}
          settings={settings}
          selectionMode={selectionMode}
          isSelected={selectedIds.has(group.mainFile.id)}
          isPreviewing={previewingFileId === group.mainFile.id}
          onToggleSelect={() => onToggleSelect(group.mainFile.id)}
          onPreviewSelect={() => onPreviewSelect?.(group.mainFile.id, group.mainFile.file, mainLabel, group.mainFile.customOutputName, group.id, group.mainFile.customStampPosition, group.mainFile.rotation)}
          onRemove={() => removeGroup(group.id)}
          onMakeBranch={!isFirst ? () => makeBranch(group.id) : undefined}
          onRenameOutput={(name) => setCustomOutputName(group.id, group.mainFile.id, name)}
          onSavePosition={(pos) => setCustomStampPosition(group.id, group.mainFile.id, pos)}
          onResetPosition={() => setCustomStampPosition(group.id, group.mainFile.id, undefined)}
          onRotate={(r) => setRotation(group.id, group.mainFile.id, r)}
          onReplaceFile={(newFile) => replaceFile(group.id, group.mainFile.id, newFile)}
          onSplitFile={(f1, f2) => splitFileIntoTwo(group.id, group.mainFile.id, f1, f2)}
        />

        {/* 枝番ファイル（ドラッグ並び替え可能） */}
        {group.branchFiles.length > 0 && (
          <DndContext
            sensors={branchSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleBranchDragEnd}
          >
            <SortableContext
              items={group.branchFiles.map((f) => f.id)}
              strategy={horizontalListSortingStrategy}
            >
              {group.branchFiles.map((entry, j) => (
                <SortableBranchItem key={entry.id} id={entry.id}>
                  <FileCard
                    label={branchLabels[j]}
                    file={entry.file}
                    customOutputName={entry.customOutputName}
                    customStampPosition={entry.customStampPosition}
                    rotation={entry.rotation}
                    isBranch={true}
                    settings={settings}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(entry.id)}
                    isPreviewing={previewingFileId === entry.id}
                    onToggleSelect={() => onToggleSelect(entry.id)}
                    onPreviewSelect={() => onPreviewSelect?.(entry.id, entry.file, branchLabels[j], entry.customOutputName, group.id, entry.customStampPosition, entry.rotation)}
                    onRemove={() => removeBranch(group.id, entry.id)}
                    onMakeMain={() => makeMain(group.id, entry.id)}
                    onRenameOutput={(name) => setCustomOutputName(group.id, entry.id, name)}
                    onSavePosition={(pos) => setCustomStampPosition(group.id, entry.id, pos)}
                    onResetPosition={() => setCustomStampPosition(group.id, entry.id, undefined)}
                    onRotate={(r) => setRotation(group.id, entry.id, r)}
                    onReplaceFile={(newFile) => replaceFile(group.id, entry.id, newFile)}
                    onSplitFile={(f1, f2) => splitFileIntoTwo(group.id, entry.id, f1, f2)}
                  />
                </SortableBranchItem>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
