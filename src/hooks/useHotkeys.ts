import { useEffect } from 'react';

type KeyCombo = string; // e.g. "Cmd+Shift+P", "Esc", "C"
type HotkeyCallback = (e: KeyboardEvent) => void;

interface HotkeyMap {
    [combo: KeyCombo]: HotkeyCallback;
}

export function useHotkeys(keyMap: HotkeyMap, dependencies: unknown[] = []) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger hotkeys if user is typing in an input/textarea/editor
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.classList.contains('cm-content') ||
                target.isContentEditable
            ) {
                // Allow Esc to escape focus
                if (e.key === 'Escape') {
                    target.blur();
                }
                return;
            }

            // Build the combo string from the event
            const keys = [];
            if (e.metaKey || e.ctrlKey) keys.push('Cmd'); // Normalize Cmd/Ctrl
            if (e.shiftKey) keys.push('Shift');
            if (e.altKey) keys.push('Alt');

            // Map special keys or capitalize single letters
            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key.length === 1) key = key.toUpperCase();

            // Ignore if it's just a modifier key
            if (!['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) {
                keys.push(key);
            }

            const comboString = keys.join('+');

            // Check if this exact combo is registered
            if (keyMap[comboString]) {
                e.preventDefault();
                keyMap[comboString](e);
            } else if (keyMap[key]) {
                // Also check un-modified single keys like "C"
                e.preventDefault();
                keyMap[key](e);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, dependencies);
}
