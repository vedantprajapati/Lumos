import { describe, it, expect } from 'vitest';
import { formatStopwatch } from '../App';

describe('formatStopwatch helper', () => {
    it('should format seconds into HH:MM:SS format', () => {
        expect(formatStopwatch(0)).toBe('00:00:00');
        expect(formatStopwatch(59)).toBe('00:00:59');
        expect(formatStopwatch(60)).toBe('00:01:00');
        expect(formatStopwatch(3599)).toBe('00:59:59');
        expect(formatStopwatch(3600)).toBe('01:00:00');
        expect(formatStopwatch(3661)).toBe('01:01:01');
        expect(formatStopwatch(86399)).toBe('23:59:59');
    });
});
