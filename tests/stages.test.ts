import { describe, it, expect } from 'vitest';
import { columnFor, LOST_OR_DNC } from '../src/lib/stages';

describe('columnFor', () => {
  it('maps closed_lost to closed column', () => {
    expect(columnFor('closed_lost')).toBe('closed');
  });
  it('maps closed_won to closed column', () => {
    expect(columnFor('closed_won')).toBe('closed');
  });
  it('passes through dialing', () => {
    expect(columnFor('dialing')).toBe('dialing');
  });
});

describe('LOST_OR_DNC', () => {
  it('includes closed_lost', () => {
    expect(LOST_OR_DNC).toContain('closed_lost');
  });
  it('excludes closed_won', () => {
    expect(LOST_OR_DNC).not.toContain('closed_won');
  });
});
