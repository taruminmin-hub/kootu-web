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

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('kootu-settings');
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return defaultSettings;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface AppState {
  groups: FileGroup[];
  settings: Settings;

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
}

export const useStore = create<AppState>((set) => ({
  groups: [],
  settings: loadSettings(),

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
    set((s) => ({ groups: s.groups.filter((g) => g.id !== groupId) })),

  removeBranch: (groupId, fileId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, branchFiles: g.branchFiles.filter((f) => f.id !== fileId) }
          : g,
      ),
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
      try { localStorage.setItem('kootu-settings', JSON.stringify(newSettings)); } catch { /* ignore */ }
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

  clearAll: () => set({ groups: [] }),

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

  deleteFiles: (fileIds) =>
    set((s) => {
      const idsSet = new Set(fileIds);
      return {
        groups: s.groups
          .filter((g) => !idsSet.has(g.mainFile.id))
          .map((g) => ({
            ...g,
            branchFiles: g.branchFiles.filter((f) => !idsSet.has(f.id)),
          })),
      };
    }),
}));
