import { isValidDate, daysBetween } from './dates';
import type { Note } from './notes';

export const MEETING_PLACE_MAX = 40;
export const MEETING_INVALID = `A meeting needs a real date and a place of up to ${MEETING_PLACE_MAX} characters.`;

export interface Meeting {
  date: string;
  place: string;
}

/** The admin form's meeting fields, as typed, so a bad value can be shown again. */
export interface MeetingDraft {
  date: string;
  place: string;
}

export const EMPTY_MEETING: MeetingDraft = { date: '', place: '' };

export type SkyState = 'growing' | 'arrived' | 'kept';

export interface Sky {
  state: SkyState;
  place: string;
  date: string;
  /** Dates of the notes that are stars, oldest first. */
  stars: string[];
  sleeps: number;
}

function isMeeting(value: unknown): value is Meeting {
  if (typeof value !== 'object' || value === null) return false;
  const { date, place } = value as Record<string, unknown>;
  return typeof date === 'string' && isValidDate(date) &&
    typeof place === 'string' && place.trim() !== '' && place.length <= MEETING_PLACE_MAX;
}

function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function parseMeetings(raw: string | null): Meeting[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isMeeting)) throw new Error('Stored meetings are invalid');
  if (new Set(data.map((m) => m.date)).size !== data.length) throw new Error('Stored meetings repeat a date');
  return sortMeetings(data.map((m) => ({ date: m.date, place: m.place })));
}

export function upsertMeeting(meetings: Meeting[], meeting: Meeting): Meeting[] {
  return sortMeetings([...meetings.filter((m) => m.date !== meeting.date), meeting]);
}

export function removeMeeting(meetings: Meeting[], date: string): Meeting[] {
  return meetings.filter((m) => m.date !== date);
}

export function parseMeetingForm(get: (name: string) => string): { meeting?: Meeting; draft: MeetingDraft; error?: string } {
  const draft: MeetingDraft = { date: get('meet_date').trim(), place: get('meet_place').trim() };
  const meeting: Meeting = { date: draft.date, place: draft.place };
  return isMeeting(meeting) ? { meeting, draft } : { draft, error: MEETING_INVALID };
}

// The sky counts toward the next meeting (or keeps the last one), with a star for every
// note since the meeting before it, up to today.
export function skyFor(notes: Note[], meetings: Meeting[], today: string): Sky | null {
  const sorted = sortMeetings(meetings);
  if (sorted.length === 0) return null;
  const next = sorted.findIndex((m) => m.date >= today);
  const index = next === -1 ? sorted.length - 1 : next;
  const target = sorted[index];
  const after = index > 0 ? sorted[index - 1].date : '';
  const stars = notes
    .map((n) => n.date)
    .filter((d) => d > after && d <= target.date && d <= today)
    .sort();
  const state: SkyState = today < target.date ? 'growing' : today === target.date ? 'arrived' : 'kept';
  return {
    state, place: target.place, date: target.date, stars,
    sleeps: state === 'growing' ? daysBetween(today, target.date) : 0,
  };
}
