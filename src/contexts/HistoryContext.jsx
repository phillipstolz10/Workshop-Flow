import { createContext, useContext } from 'react';

export const HistoryContext = createContext({
  canUndo: false,
  canRedo: false,
  undo: () => {},
  redo: () => {},
});

export function useHistory() {
  return useContext(HistoryContext);
}
