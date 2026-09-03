import { useState, useEffect, useCallback } from 'react'
import {
  getAllProgress,
  saveProgress as dbSaveProgress,
  clearProgress,
  getProgress,
  setFileWatched as dbSetFileWatched,
  setFilesWatched as dbSetFilesWatched,
} from '../db'
import type { WatchProgress } from '../types'
import { isProgressFinished, hasProgress } from '../types'

export function useWatchProgress() {
  const [progressMap, setProgressMap] = useState<Map<string, WatchProgress>>(new Map())

  useEffect(() => {
    getAllProgress().then((all) => {
      setProgressMap(new Map(all.map((p) => [p.fileId, p])))
    })
  }, [])

  const saveProgress = useCallback(async (fileId: string, position: number, duration: number) => {
    await dbSaveProgress(fileId, position, duration)
    setProgressMap((prev) => {
      const next = new Map(prev)
      next.set(fileId, { fileId, position, duration, lastWatched: Date.now() })
      return next
    })
  }, [])

  const removeProgress = useCallback(async (fileId: string) => {
    await clearProgress(fileId)
    setProgressMap((prev) => {
      const next = new Map(prev)
      next.delete(fileId)
      return next
    })
  }, [])

  // Manually mark a file as fully watched
  const markWatched = useCallback(async (fileId: string) => {
    await dbSetFileWatched(fileId)
    setProgressMap((prev) => {
      const next = new Map(prev)
      next.set(fileId, { fileId, position: 1, duration: 1, lastWatched: Date.now() })
      return next
    })
  }, [])

  // Manually mark many files as fully watched (e.g. a whole season)
  const markFilesWatched = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return
    await dbSetFilesWatched(fileIds)
    const now = Date.now()
    setProgressMap((prev) => {
      const next = new Map(prev)
      for (const fileId of fileIds) next.set(fileId, { fileId, position: 1, duration: 1, lastWatched: now })
      return next
    })
  }, [])

  // Clear watch state for many files (mark unwatched)
  const clearFilesWatched = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return
    await Promise.all(fileIds.map((fileId) => clearProgress(fileId)))
    setProgressMap((prev) => {
      const next = new Map(prev)
      for (const fileId of fileIds) next.delete(fileId)
      return next
    })
  }, [])

  const getProgressForFile = useCallback(
    (fileId: string): WatchProgress | undefined => progressMap.get(fileId),
    [progressMap],
  )

  // Returns items currently in progress (not finished, has progress)
  const inProgress = Array.from(progressMap.values())
    .filter((p) => hasProgress(p))
    .sort((a, b) => b.lastWatched - a.lastWatched)

  return {
    progressMap,
    inProgress,
    saveProgress,
    removeProgress,
    markWatched,
    markFilesWatched,
    clearFilesWatched,
    getProgressForFile,
    isFinished: (fileId: string) => {
      const p = progressMap.get(fileId)
      return p ? isProgressFinished(p) : false
    },
    getProgressFraction: (fileId: string) => {
      const p = progressMap.get(fileId)
      if (!p || p.duration === 0) return 0
      return Math.min(p.position / p.duration, 1)
    },
  }
}

export async function fetchFileProgress(fileId: string): Promise<WatchProgress | undefined> {
  return getProgress(fileId)
}
