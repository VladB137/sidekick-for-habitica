import { h, icon, button, ripple } from '../ui/dom';
import { store } from '../store';
import { ApiError } from '../../api/client';
import { native } from '../native';
import { canDemo, enterDemo } from '../demo';

// the public repo comes with the public release; until then the private one (signed-in GitHub only)
const REPO = 'https://github.com/VladB137/sidekick-for-habitica';

/** Habitica's page with both values (User ID and API Token), on the website; the Android app has the same under Settings → My Account → API. */
const API_PAGE = 'https://habitica.com/user/settings/siteData';
/** On the phone: Habitica's own app when it's installed, the website when it isn't (the plain link does the website). */
const openHabitica = (e: Event) => { if (native.canOpenHabitica()) { e.preventDefault(); void native.openHabitica(); } };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function loginView (): HTMLElement {
  let showToken = false;
  let error = '';
  const userId = h('input', { id: 'uid', autocomplete: 'username', spellcheck: false, placeholder: ' ', inputmode: 'text', 'aria-describedby': 'uid-help' });
  const token = h('input', { id: 'tok', type: 'password', autocomplete: 'current-password', spellcheck: false, placeholder: ' ', 'aria-describedby': 'tok-help' });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
  // a token Habitica stopped accepting (reset elsewhere) lands here with an explanation
  const err = h('div', { class: 'notice error', hidden: !store.authError, role: 'alert' }, store.authError || '');
  const eye = button('', () => { showToken = !showToken; token.type = showToken ? 'text' : 'password'; eye.replaceChildren(icon(showToken ? 'visibility_off' : 'visibility')); }, { kind: 'icon', icon: 'visibility', cls: 'eye', title: 'Show or hide the token' });

  // the format, checked as you type or paste: 36 characters with dashes, so a short or doubled paste shows before Connect
  const help = (input: HTMLInputElement, id: string, what: string) => {
    const el = h('p', { class: 'field-help', id, 'data-k': id, 'aria-live': 'polite' });
    const draw = () => {
      const v = input.value.trim();
      el.classList.toggle('ok', isUuid(v));
      el.classList.toggle('bad', !!v && !isUuid(v));
      el.textContent = !v ? `${what}: 36 characters with dashes, like 1a2b3c4d-…`
        : isUuid(v) ? 'Looks right.'
          : (v.match(UUID)?.length ?? 0) > 1 ? 'That’s two codes. Paste one here and the other below.'
            : `${v.length} of 36 characters${/[^0-9a-f-]/i.test(v) ? ', and only 0–9, a–f and dashes belong in it' : ''}.`;
    };
    input.addEventListener('input', draw);
    draw();
    return el;
  };
  const uidHelp = help(userId, 'uid-help', 'Your User ID');
  const tokHelp = help(token, 'tok-help', 'Your API Token');
  // both codes in one paste (from notes, say): the first is the User ID, the second the token, as Habitica lists them
  const fill = (text: string, into: HTMLInputElement): boolean => {
    const found = text.match(UUID) || [];
    if (found.length >= 2) { userId.value = found[0]!; token.value = found[1]!; }
    else if (found.length === 1) into.value = found[0]!;
    else return false;
    for (const i of [userId, token]) i.dispatchEvent(new Event('input'));
    return true;
  };
  for (const input of [userId, token]) input.addEventListener('paste', (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') || '';
    if (fill(text, input)) e.preventDefault();
  });
  const canPaste = typeof navigator.clipboard?.readText === 'function';
  const pasteInto = (input: HTMLInputElement, what: string, cls: string) => canPaste ? button('', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!fill(text, input)) { input.value = text.trim(); input.dispatchEvent(new Event('input')); }
      input.focus();
    } catch {
      err.textContent = 'This phone didn’t let Sidekick read the clipboard. Long-press the field and choose Paste.'; err.hidden = false;
    }
  }, { kind: 'icon', icon: 'content_paste', cls: `paste ${cls}`, title: `Paste your ${what}`, k: `paste-${input.id}` }) : null;

  const submit = h('button', { class: 'btn btn-raised', type: 'submit' }, 'Connect');
  ripple(submit);
  const form = h('form', {
    on: {
      submit: async (e: Event) => {
        e.preventDefault();
        const uid = userId.value.trim(); const tok = token.value.trim();
        if (!isUuid(uid)) { error = 'The User ID is 36 characters, like 1a2b3c4d-5e6f-….'; }
        else if (!isUuid(tok)) { error = 'The API Token is also 36 characters with dashes. Copy it from the same page as the User ID.'; }
        else if (uid.toLowerCase() === tok.toLowerCase()) { error = 'Both fields hold the same code. The API Token is the second one on Habitica’s page.'; }
        else error = '';
        if (error) { err.textContent = error; err.hidden = false; return; }
        submit.disabled = true; submit.textContent = 'Connecting…';
        try {
          await store.login({ userId: uid, apiToken: tok }, remember.checked);
        } catch (ex) {
          const msg = ex instanceof ApiError
            ? (ex.status === 401 ? 'Habitica didn’t accept that User ID and API Token. Check both, or copy them again.' : ex.code === 'network' ? 'Couldn’t reach Habitica. Check your connection and try again.' : ex.message)
            : String((ex as Error)?.message || ex);
          err.textContent = msg; err.hidden = false;
          submit.disabled = false; submit.textContent = 'Connect';
        }
      },
    },
  },
  h('div', { class: `field ${canPaste ? 'with-paste' : ''}` }, userId, h('label', { for: 'uid' }, 'User ID'), pasteInto(userId, 'User ID', 'only')),
  uidHelp,
  h('div', { class: `field ${canPaste ? 'with-paste' : ''} with-eye` }, token, h('label', { for: 'tok' }, 'API Token'), pasteInto(token, 'API Token', 'beside-eye'), eye),
  tokHelp,
  h('label', { class: 'checkbox' }, remember, 'Remember on this device'),
  h('p', { class: 'small muted', style: 'margin:0 0 0 26px' }, 'Skip this on a shared device.'),
  err,
  h('div', { class: 'card-actions', style: 'padding:8px 0' }, submit),
  );

  return h('main', { class: 'login' },
    h('div', { class: 'login-hero' },
      h('h1', null, 'Sidekick for Habitica'),
      h('p', null, 'A crit planner for Habitica'),
    ),
    h('p', null, 'Habitica’s critical hits aren’t random: the roll is computed from your own numbers. Sidekick reads them, tells you before you tap whether the next task will crit, and shows the cheapest honest way to make it crit.'),
    h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('div', { class: 'card-title', style: 'font-size:18px' }, 'Connect your account'),
        h('ol', { class: 'steps login-steps' },
          h('li', null, 'Open Habitica’s API settings and copy your User ID.',
            h('div', { class: 'login-open' }, h('a', { class: 'btn btn-outlined', href: API_PAGE, target: '_blank', rel: 'noopener', 'data-k': 'open-api-page', on: { click: openHabitica } }, icon('open_in_new'), 'Open Habitica settings')),
            h('div', { class: 'small muted' }, 'In the Habitica app: Menu → Settings → My Account → API.')),
          h('li', null, 'Paste it below, then copy and paste your API Token the same way.'),
        ),
        form,
      ),
    ),
    // a stranger may want to see it work before handing over a password-equivalent token (demo.ts)
    canDemo() ? h('div', { class: 'card login-try', 'data-k': 'login-try' },
      h('div', { class: 'card-body' },
        h('div', { class: 'card-title' }, 'Not ready to connect?'),
        h('p', null, 'Try the whole app on a made-up account. Habitica’s own game code answers on this device, so it works as it would with yours. Nothing goes to Habitica and nothing is kept.')),
      h('div', { class: 'card-actions' }, ripple(h('button', { class: 'btn btn-outlined', type: 'button', 'data-k': 'try-demo', on: { click: enterDemo } }, icon('play_arrow'), 'Try it without an account')))) : null,
    h('div', { class: 'notice' },
      h('div', { class: 'row' }, icon('lock'), h('div', null,
        h('b', null, 'Your API Token works like a password. '),
        'It goes only to habitica.com, straight from this device. Sidekick has no server and collects nothing.',
        h('details', { class: 'more', 'data-k': 'token-more' },
          h('summary', null, 'More'),
          h('p', null, 'If you tick “Remember on this device”, it is stored in this app’s storage on this device only, together with a copy of your last numbers and tasks so the app opens instantly, until you log out. Otherwise it is forgotten when you close the app.')),
      )),
    ),
    h('p', { class: 'small muted' },
      'Sidekick for Habitica is an independent, open-source tool (GPL-3.0) and is not affiliated with or endorsed by Habitica. ',
      h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'Source code'), '.',
    ),
  );
}
