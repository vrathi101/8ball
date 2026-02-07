/**
 * 8-Ball Pool - Sound Manager React Hook
 * Creates AudioContext on first user interaction (browser requirement)
 */

import { useRef, useEffect, useCallback } from 'react';
import { SoundManager } from './SoundManager';

export function useSoundManager() {
    const managerRef = useRef<SoundManager>(new SoundManager());

    // Initialize on first user click/touch (browser autoplay policy)
    useEffect(() => {
        const handler = () => {
            const mgr = managerRef.current;
            mgr.init();
            mgr.resume();
        };

        window.addEventListener('click', handler, { once: false });
        window.addEventListener('touchstart', handler, { once: false });

        return () => {
            window.removeEventListener('click', handler);
            window.removeEventListener('touchstart', handler);
        };
    }, []);

    const getSoundManager = useCallback(() => managerRef.current, []);

    return { soundManager: managerRef.current, getSoundManager };
}
