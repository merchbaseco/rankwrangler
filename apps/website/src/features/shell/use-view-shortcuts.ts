import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasCommandModifier, isTypingTarget } from './is-typing-target';
import { views } from './view-tabs-model';

/** How long after `g` the second key still counts. */
const SEQUENCE_MS = 1000;

/**
 * Go-to sequences, as in Linear and GitHub: `g` then `e` opens Explore, `g`
 * then `k` Keywords, from anywhere outside a text field.
 */
export const useViewShortcuts = () => {
    const navigate = useNavigate();
    useEffect(() => {
        let pendingSince = 0;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (hasCommandModifier(event) || isTypingTarget(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            if (Date.now() - pendingSince <= SEQUENCE_MS) {
                pendingSince = 0;
                const view = views.find(candidate => candidate.shortcut === key);
                if (view?.href) {
                    event.preventDefault();
                    event.stopPropagation();
                    navigate(view.href);
                }
                return;
            }
            if (key === 'g') {
                // A grid's typeahead would otherwise jump to a row starting with "g".
                event.stopPropagation();
                pendingSince = Date.now();
            }
        };
        // Captured so a focused table's typeahead or row cursor never takes the second key.
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [navigate]);
};
