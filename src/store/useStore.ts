import { create } from 'zustand';
import type { FileGroup, FileEntry, Settings } from '../types';

const defaultSettings: Settings = {
  symbol: '甲',
  customSymbol: '',
  startNumber: 1,
  stampFormat: 'full-cert',
  fontSize: 14,
  color: 'red',
  marginTop: 20,
  marginRight: 20,
  whiteBackground: false,
  border: false,
  fileNameNumberFormat: 'zero-padded',
  fileNameJoinFormat: 'space',
  customFileNameFormat: '{stamp} {name}.pdf',
  mergeBranches: false,
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface AppState {
  groups: FileGroup[];
  settings: Settings;

  addFiles: (files: File[]) => void;
  removeGroup: (groupId: string) => void;
  removeBranch: (groupId: string, fileId: string) => void;
  moveGroupUp: (groupId: string) => void;
  moveGroupDown: (groupId: string) => void;
  /** 現在のグループを直前のグループの枝番にする */
  makeBranch: (groupId: string) => void;
  /** 枝番ファイルを独立したグループにする */
  makeMain: (groupId: string, fileId: string) => void;
  reorderGroups: (activeId: string, overId: string) => void;
  updateSettings: (partial: Partial<Settings>) => void;
  clearAll: () => void;
}

export const useStore = create<AppState>((set) => ({
  groups: [],
  settings: defaultSettings,

  addFiles: (files) =>
    set((s) => ({
      groups: [
        ...s.groups,
        ...files.map((file): FileGroup => ({
          id: genId(),
          mainFile: { id: genId(), file },
          branchFiles: [],
        })),
      ],
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
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  clearAll: () => set({ groups: [] }),
}));
