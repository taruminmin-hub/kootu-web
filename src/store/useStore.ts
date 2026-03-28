import { create } from 'zustand';
import type { FileGroup, FileEntry, Settings, StampPosition } from '../types';

const defaultSettings: Settings = {
  symbol: '甲',
  customSymbol: '',
  startNumber: 1,
  numberless: false,
  stampFormat: 'full-cert',
  fontSize: 14,
  color: 'red',
  marginTop: 20,
  marginRight: 20,
  whiteBackground: false,
  border: false,
  pageNumberEnabled: false,
  pageNumberFormat: 'n',
  pageNumberPosition: 'bottom-center',
  pageNumberFontSize: 10,
  pageNumberColor: 'black',
  fileNameNumberFormat: 'zero-padded',
  fileNameJoinFormat: 'space',
  customFileNameFormat: '{stamp} {name}.pdf',
  mergeBranches: false,
};

const SETTINGS_VERSION = 2;

/** バージョンごとのマイグレーション関数 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: green を color に追加（型変更のみ、データは互換）
  2: (data) => data,
};

function migrateSettings(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = data;
  for (let v = fromVersion + 1; v <= SETTINGS_VERSION; v++) {
    if (migrations[v]) current = migrations[v](current);
  }
  return current;
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('kootu-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const version = parsed.__version ?? 0;
      if (version < SETTINGS_VERSION) {
        // マイグレーションして保存し直す
        const migrated = migrateSettings(parsed, version);
        const result = { ...defaultSettings, ...migrated };
        try {
          localStorage.setItem('kootu-settings', JSON.stringify({ ...result, __version: SETTINGS_VERSION }));
        } catch { /* ignore */ }
        return result as Settings;
      }
      return { ...defaultSettings, ...parsed };
    }
  } catch { /* ignore */ }
  return defaultSettings;
}

function genId(): string {
  return crypto.randomUUID();
}

interface UndoSnapshot {
  groups: FileGroup[];
  label: string;
  timestamp: number;
}

interface AppState {
  groups: FileGroup[];
  settings: Settings;
  /** 直前の削除操作を元に戻すためのスナップショット */
  undoSnapshot: UndoSnapshot | null;

  addFiles: (files: Array<{ file: File; rotation?: 0 | 90 | 180 | 270 }>) => void;
  setRotation: (groupId: string, fileId: string, rotation: 0 | 90 | 180 | 270) => void;
  removeGroup: (groupId: string) => void;
  removeBranch: (groupId: string, fileId: string) => void;
  moveGroupUp: (groupId: string) => void;
  moveGroupDown: (groupId: string) => void;
  makeBranch: (groupId: string) => void;
  makeMain: (groupId: string, fileId: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  /** ファイルのカスタム出力名を設定する */
  setCustomOutputName: (groupId: string, fileId: string, name: string) => void;
  /** ファイルのスタンプ位置を個別に設定する */
  setCustomStampPosition: (groupId: string, fileId: string, pos: StampPosition | undefined) => void;
  clearAll: () => void;
  toggleMergeBranches: (groupId: string) => void;
  reorderBranchFiles: (groupId: string, activeId: string, overId: string) => void;
  deleteFiles: (fileIds: string[]) => void;
  /** sourceGroup を targetGroup の枝番として移動する */
  moveGroupAsBranch: (sourceGroupId: string, targetGroupId: string) => void;
  /** ファイルの File オブジェクトを差し替える（ページ編集後に使用） */
  replaceFile: (groupId: string, fileId: string, newFile: File) => void;
  /** 1つのFileEntryを2ファイルに分割してグループ/枝番に展開する */
  splitFileIntoTwo: (groupId: string, fileId: string, file1: File, file2: File) => void;
  /** AI分割結果のファイル群をグループとして追加する（名前付き） */
  addFilesFromSplit: (files: Array<{ file: File; suggestedName: string }>) => void;
  /** 複数ファイルの出力名を一括で更新する */
  batchRename: (updates: Array<{ groupId: string; fileId: string; name: string }>) => void;
  /** 直前の削除操作を元に戻す */
  undo: () => void;
  /** Undoスナップショットをクリアする */
  clearUndo: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  groups: [],
  settings: loadSettings(),
  undoSnapshot: null,

  addFiles: (files) =>
    set((s) => ({
      groups: [
        ...s.groups,
        ...files.map((item): FileGroup => ({
          id: genId(),
          mainFile: { id: genId(), file: item.file, rotation: item.rotation ?? 0 },
          branchFiles: [],
        })),
      ],
    })),

  setRotation: (groupId, fileId, rotation) =>
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.mainFile.id === fileId) {
          return { ...g, mainFile: { ...g.mainFile, rotation } };
        }
        return {
          ...g,
          branchFiles: g.branchFiles.map((f) =>
            f.id === fileId ? { ...f, rotation } : f,
          ),
        };
      }),
    })),

  removeGroup: (groupId) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      undoSnapshot: { groups: s.groups, label: 'グループを削除', timestamp: Date.now() },
    })),

  removeBranch: (groupId, fileId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, branchFiles: g.branchFiles.filter((f) => f.id !== fileId) }
          : g,
      ),
      undoSnapshot: { groups: s.groups, label: '枝番を削除', timestamp: Date.now() },
    })),

  moveGroupUp: (groupId) =>
    set((s) => {
      const idx = s.groups.findIndex((g) => g.id === groupId);
      if (idx <= 0) return s;
      const gs = [...s.groups];
      [gs[idx - 1], gs[idx]] = [gs[idx], gs[idx - 1]];
      return { groups: gs };
    }),

  moveGroupDown: (groupId) =>
    set((s) => {
      const idx = s.groups.findIndex((g) => g.id === groupId);
      if (idx < 0 || idx >= s.groups.length - 1) return s;
      const gs = [...s.groups];
      [gs[idx], gs[idx + 1]] = [gs[idx + 1], gs[idx]];
      return { groups: gs };
    }),

  makeBranch: (groupId) =>
    set((s) => {
      const idx = s.groups.findIndex((g) => g.id === groupId);
      if (idx <= 0) return s;
      const cur = s.groups[idx];
      const prev = s.groups[idx - 1];
      const newBranches: FileEntry[] = [
        ...prev.branchFiles,
        cur.mainFile,
        ...cur.branchFiles,
      ];
      const gs = [...s.groups];
      gs[idx - 1] = { ...prev, branchFiles: newBranches };
      gs.splice(idx, 1);
      return { groups: gs };
    }),

  makeMain: (groupId, fileId) =>
    set((s) => {
      const idx = s.groups.findIndex((g) => g.id === groupId);
      if (idx < 0) return s;
      const group = s.groups[idx];
      const branchFile = group.branchFiles.find((f) => f.id === fileId);
      if (!branchFile) return s;
      const gs = [...s.groups];
      gs[idx] = { ...group, branchFiles: group.branchFiles.filter((f) => f.id !== fileId) };
      gs.splice(idx + 1, 0, {
        id: genId(),
        mainFile: branchFile,
        branchFiles: [],
      });
      return { groups: gs };
    }),

  reorderGroups: (activeId, overId) =>
    set((s) => {
      const from = s.groups.findIndex((g) => g.id === activeId);
      const to = s.groups.findIndex((g) => g.id === overId);
      if (from === -1 || to === -1) return s;
      const gs = [...s.groups];
      const [item] = gs.splice(from, 1);
      gs.splice(to, 0, item);
      return { groups: gs };
    }),

  updateSettings: (partial) =>
    set((s) => {
      const newSettings = { ...s.settings, ...partial };
      try {
        localStorage.setItem('kootu-settings', JSON.stringify({ ...newSettings, __version: SETTINGS_VERSION }));
      } catch { /* ignore */ }
      return { settings: newSettings };
    }),

  setCustomOutputName: (groupId, fileId, name) =>
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.mainFile.id === fileId) {
          return { ...g, mainFile: { ...g.mainFile, customOutputName: name } };
        }
        return {
          ...g,
          branchFiles: g.branchFiles.map((f) =>
            f.id === fileId ? { ...f, customOutputName: name } : f,
          ),
        };
      }),
    })),

  setCustomStampPosition: (groupId, fileId, pos) =>
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.mainFile.id === fileId) {
          return { ...g, mainFile: { ...g.mainFile, customStampPosition: pos } };
        }
        return {
          ...g,
          branchFiles: g.branchFiles.map((f) =>
            f.id === fileId ? { ...f, customStampPosition: pos } : f,
          ),
        };
      }),
    })),

  clearAll: () => set((s) => ({
    groups: [],
    undoSnapshot: { groups: s.groups, label: 'リストクリア', timestamp: Date.now() },
  })),

  toggleMergeBranches: (groupId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, mergeBranches: !(g.mergeBranches ?? s.settings.mergeBranches) }
          : g,
      ),
    })),

  reorderBranchFiles: (groupId, activeId, overId) =>
    set((s) => {
      const gIdx = s.groups.findIndex((g) => g.id === groupId);
      if (gIdx < 0) return s;
      const group = s.groups[gIdx];
      const fromIdx = group.branchFiles.findIndex((f) => f.id === activeId);
      const toIdx = group.branchFiles.findIndex((f) => f.id === overId);
      if (fromIdx < 0 || toIdx < 0) return s;
      const branches = [...group.branchFiles];
      const [item] = branches.splice(fromIdx, 1);
      branches.splice(toIdx, 0, item);
      const gs = [...s.groups];
      gs[gIdx] = { ...group, branchFiles: branches };
      return { groups: gs };
    }),

  moveGroupAsBranch: (sourceGroupId, targetGroupId) =>
    set((s) => {
      const srcIdx = s.groups.findIndex((g) => g.id === sourceGroupId);
      const tgtIdx = s.groups.findIndex((g) => g.id === targetGroupId);
      if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return s;
      const src = s.groups[srcIdx];
      const tgt = s.groups[tgtIdx];
      const newBranches: FileEntry[] = [
        ...tgt.branchFiles,
        src.mainFile,
        ...src.branchFiles,
      ];
      const gs = s.groups.filter((_, i) => i !== srcIdx);
      const newTgtIdx = gs.findIndex((g) => g.id === targetGroupId);
      gs[newTgtIdx] = { ...tgt, branchFiles: newBranches };
      return { groups: gs };
    }),

  deleteFiles: (fileIds) =>
    set((s) => {
      const idsSet = new Set(fileIds);
      const newGroups: FileGroup[] = [];
      for (const g of s.groups) {
        const mainDeleted = idsSet.has(g.mainFile.id);
        const survivingBranches = g.branchFiles.filter((f) => !idsSet.has(f.id));
        if (mainDeleted) {
          // メインが削除対象: 残った枝番の先頭を新メインに昇格
          if (survivingBranches.length > 0) {
            const [newMain, ...rest] = survivingBranches;
            newGroups.push({ ...g, mainFile: newMain, branchFiles: rest });
          }
          // 残りなし → グループごと削除
        } else {
          newGroups.push({ ...g, branchFiles: survivingBranches });
        }
      }
      return {
        groups: newGroups,
        undoSnapshot: { groups: s.groups, label: `${fileIds.length}件を削除`, timestamp: Date.now() },
      };
    }),

  replaceFile: (groupId, fileId, newFile) =>
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        if (g.mainFile.id === fileId) {
          return { ...g, mainFile: { ...g.mainFile, file: newFile } };
        }
        return {
          ...g,
          branchFiles: g.branchFiles.map((f) =>
            f.id === fileId ? { ...f, file: newFile } : f,
          ),
        };
      }),
    })),

  splitFileIntoTwo: (groupId, fileId, file1, file2) =>
    set((s) => {
      const gIdx = s.groups.findIndex((g) => g.id === groupId);
      if (gIdx < 0) return s;
      const group = s.groups[gIdx];

      if (group.mainFile.id === fileId) {
        // メインファイルを分割: file1 は現グループに、file2 は後に挿入した新グループに
        const gs = [...s.groups];
        gs[gIdx] = { ...group, mainFile: { ...group.mainFile, file: file1 } };
        gs.splice(gIdx + 1, 0, {
          id: genId(),
          mainFile: { id: genId(), file: file2, rotation: group.mainFile.rotation },
          branchFiles: [],
        });
        return { groups: gs };
      }

      // 枝番ファイルを分割: 同グループ内に新枝番として挿入
      const branchIdx = group.branchFiles.findIndex((f) => f.id === fileId);
      if (branchIdx < 0) return s;
      const branchEntry = group.branchFiles[branchIdx];
      const newBranches = [...group.branchFiles];
      newBranches[branchIdx] = { ...branchEntry, file: file1 };
      newBranches.splice(branchIdx + 1, 0, {
        id: genId(),
        file: file2,
        rotation: branchEntry.rotation,
      });
      const gs = [...s.groups];
      gs[gIdx] = { ...group, branchFiles: newBranches };
      return { groups: gs };
    }),

  addFilesFromSplit: (files) =>
    set((s) => ({
      groups: [
        ...s.groups,
        ...files.map((item): FileGroup => ({
          id: genId(),
          mainFile: {
            id: genId(),
            file: item.file,
            customOutputName: item.suggestedName,
            rotation: 0,
          },
          branchFiles: [],
        })),
      ],
    })),

  batchRename: (updates) =>
    set((s) => {
      const map = new Map(updates.map((u) => [`${u.groupId}:${u.fileId}`, u.name]));
      return {
        groups: s.groups.map((g) => {
          const mainKey = `${g.id}:${g.mainFile.id}`;
          const mainName = map.get(mainKey);
          const newMain = mainName !== undefined
            ? { ...g.mainFile, customOutputName: mainName }
            : g.mainFile;
          return {
            ...g,
            mainFile: newMain,
            branchFiles: g.branchFiles.map((f) => {
              const branchKey = `${g.id}:${f.id}`;
              const branchName = map.get(branchKey);
              return branchName !== undefined ? { ...f, customOutputName: branchName } : f;
            }),
          };
        }),
      };
    }),

  undo: () => {
    const snapshot = get().undoSnapshot;
    if (snapshot) {
      set({ groups: snapshot.groups, undoSnapshot: null });
    }
  },

  clearUndo: () => set({ undoSnapshot: null }),
}));
