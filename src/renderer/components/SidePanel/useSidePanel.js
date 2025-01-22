import { useRef } from 'react';

export const useSidePanel = () => {
  const sidePanelRef = useRef(null);

  const updateContent = (phrases) => {
    if (sidePanelRef.current) {
      sidePanelRef.current.updateContent(phrases);
    }
  };

  const clear = () => {
    if (sidePanelRef.current) {
      sidePanelRef.current.clear();
    }
  };

  return {
    ref: sidePanelRef,
    updateContent,
    clear
  };
};