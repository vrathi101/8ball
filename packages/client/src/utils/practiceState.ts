import type { TableState } from '@8ball/shared';

const PRACTICE_STORAGE_KEY = '8ball_practice_state_v1';

interface PracticeSnapshot {
    tableState: TableState;
    updatedAt: number;
}

export function loadPracticeSnapshot(): PracticeSnapshot | null {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw) as PracticeSnapshot;
    } catch {
        return null;
    }
}

export function savePracticeSnapshot(tableState: TableState): void {
    const snapshot: PracticeSnapshot = {
        tableState,
        updatedAt: Date.now(),
    };
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearPracticeSnapshot(): void {
    localStorage.removeItem(PRACTICE_STORAGE_KEY);
}

export function getPracticeLastSavedAt(): number | null {
    return loadPracticeSnapshot()?.updatedAt ?? null;
}

