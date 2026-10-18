/*
 * A game word you can tap to learn: a dotted underline, and a sheet with one or two sentences from the
 * glossary. Never inside a <label> or another button (the tap would also toggle or press that).
 */
import { h, icon, sheet } from './dom';
import { GLOSSARY, RELAXED_TEXT, type TermKey } from '../glossary';
import { relaxed } from '../mode';

export function explain (key: TermKey) {
  const g = GLOSSARY[key];
  sheet(g.title, h('p', { 'data-k': `explain-${key}` }, (relaxed() && RELAXED_TEXT[key]) || g.text), [{ label: 'Got it', primary: true, run: () => {} }]);
}

/** `text` as it reads in the sentence; the sheet is titled with the glossary's own name for it */
export function term (text: string, key: TermKey): HTMLElement {
  return h('button', {
    class: 'term', type: 'button', 'data-k': `term-${key}`, 'aria-haspopup': 'dialog',
    title: `What is ${GLOSSARY[key].title}?`, on: { click: (e: Event) => { e.stopPropagation(); explain(key); } },
  }, text);
}

/**
 * A small (?) after a short line, opening the longer story in a sheet: the screen keeps one line, the
 * detail is one tap away. `text` is our own wording, never user data (it's set as text anyway).
 */
export function hint (title: string, text: string | string[], k: string): HTMLElement {
  return h('button', {
    class: 'hint', type: 'button', 'data-k': `hint-${k}`, 'aria-haspopup': 'dialog', 'aria-label': `More about ${title}`, title: `More about ${title}`,
    on: { click: (e: Event) => { e.stopPropagation(); e.preventDefault(); sheet(title, h('div', { 'data-k': `hint-text-${k}` }, (Array.isArray(text) ? text : [text]).map(p => h('p', null, p))), [{ label: 'Got it', primary: true, run: () => {} }]); } },
  }, icon('help_outline'));
}
