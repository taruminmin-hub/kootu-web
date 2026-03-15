import { useSortable } from '@dnd-kit/sortable';
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
}

export default function FileGroupRow({ group, index, settings, isFirst, isLast }: Props) {
  const { removeGroup, removeBranch, makeBranch, makeMain, moveGroupUp, moveGroupDown, setCustomOutputName, setCustomStampPosition } = useStore();

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: group.id });

  const sym = getSymbolText(settings.symbol, settings.customSymbol);
  const mainNum = settings.startNumber + index;
  const hasBranches = group.branchFiles.length > 0;
  const nl = settings.numberless;

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
      className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-start gap-3"
    >
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
          <span className="text-[10px] text-purple-600 font-medium bg-purple-50 rounded px-1">
            {settings.mergeBranches ? '結合' : '個別'}
          </span>
        )}
      </div>

      {/* ファイルカード群（横並び） */}
      <div className="flex flex-wrap gap-2 flex-1">
        <FileCard
          label={mainLabel}
          file={group.mainFile.file}
          customOutputName={group.mainFile.customOutputName}
          customStampPosition={group.mainFile.customStampPosition}
          isBranch={false}
          settings={settings}
          onRemove={() => removeGroup(group.id)}
          onMakeBranch={!isFirst ? () => makeBranch(group.id) : undefined}
          onRenameOutput={(name) => setCustomOutputName(group.id, group.mainFile.id, name)}
          onSavePosition={(pos) => setCustomStampPosition(group.id, group.mainFile.id, pos)}
          onResetPosition={() => setCustomStampPosition(group.id, group.mainFile.id, undefined)}
        />

        {group.branchFiles.map((entry, j) => (
          <FileCard
            key={entry.id}
            label={branchLabels[j]}
            file={entry.file}
            customOutputName={entry.customOutputName}
            customStampPosition={entry.customStampPosition}
            isBranch={true}
            settings={settings}
            onRemove={() => removeBranch(group.id, entry.id)}
            onMakeMain={() => makeMain(group.id, entry.id)}
            onRenameOutput={(name) => setCustomOutputName(group.id, entry.id, name)}
            onSavePosition={(pos) => setCustomStampPosition(group.id, entry.id, pos)}
            onResetPosition={() => setCustomStampPosition(group.id, entry.id, undefined)}
          />
        ))}
      </div>
    </div>
  );
}
