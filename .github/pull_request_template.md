Before:

After:

How:

## Checks (summary lines, Node 20, harness at the `rules.ts` tag)
```
typecheck:
build:
npm test:     sin … · parity A B C D D2 E F G …
e2e:          …/… (only grows; 82 at M1.2)
actionlint:
```

## Rules this touches
- [ ] Engine change: every parity suite identical at the `rules.ts` tag
- [ ] New lever: deterministic, verified against Habitica's code, plausible, not an exploit; listed in release notes
- [ ] Behaviour change: docs/details.md updated (README.md too if players would notice)
- [ ] Nothing here logs, stores or publishes the API token or real account numbers
- [ ] No new network, analytics or telemetry dependency (or Vlad agreed)
