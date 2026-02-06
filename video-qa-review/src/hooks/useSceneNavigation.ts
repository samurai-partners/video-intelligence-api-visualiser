"use client";

import { useEffect, useCallback } from "react";
import { useProjectStore } from "@/stores/useProjectStore";

export function useSceneNavigation() {
  const scenes = useProjectStore((s) => s.scenes);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);

  const goToScene = useCallback(
    (index: number) => {
      if (index >= 0 && index < scenes.length) {
        setCurrentSceneIndex(index);
      }
    },
    [scenes.length, setCurrentSceneIndex]
  );

  const goToPrevScene = useCallback(() => {
    goToScene(currentSceneIndex - 1);
  }, [currentSceneIndex, goToScene]);

  const goToNextScene = useCallback(() => {
    goToScene(currentSceneIndex + 1);
  }, [currentSceneIndex, goToScene]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevScene();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNextScene();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevScene, goToNextScene]);

  return {
    currentSceneIndex,
    currentScene: scenes[currentSceneIndex] || null,
    totalScenes: scenes.length,
    goToScene,
    goToPrevScene,
    goToNextScene,
    hasPrev: currentSceneIndex > 0,
    hasNext: currentSceneIndex < scenes.length - 1,
  };
}
