import { createContext, useContext } from 'react';

export const HistoryContext = createContext({
  canUndo: false,
  canRedo: false,
  undo: () => {},
  redo: () => {},
  // Ref that consumers (e.g. Workshop) can set to a function(fromState, toState)
  // called after every undo/redo so they can broadcast the diff to peers.
  afterUndoRedoRef: { current: null },
});

export function useHistory() {
  return useContext(HistoryContext);
}
