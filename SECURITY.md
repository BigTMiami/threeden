# Security

3den holds people's messages, their groups, and a rough idea of where they
live, so we take reports seriously and answer them quickly.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Write to
**security@3den.example** instead (TO DO: replace with the real address
before the repository is public).

Tell us what you found, how to reproduce it, and what someone could do with
it. You'll hear back within three working days. We'll keep you posted while
we fix it, and credit you when the fix ships, unless you'd rather we didn't.

Please give us a reasonable time to fix a problem before you talk about it
publicly (90 days, or sooner once a fix is out), don't access or change
other people's data beyond what you need to show the problem, and don't
run tests that could hurt the service for others (denial of service, spam).
If you follow these, we won't pursue legal action over your research.

## What's in scope

- This code: the web app in `js/`, and later the server.
- In particular: anything that lets one person read another's direct
  messages, see a private group, learn someone's exact location, take over
  an account, or get around blocking.

## What we keep out of the repository

- Passwords, keys, tokens, and any other secrets. If you find one in the
  history, report it as a vulnerability.
- The settings that decide what looks like a bot or spam (thresholds,
  scores, and signals). The code that applies them is public; the numbers
  aren't, so bot runners can't tune their bots to slip under them.

## The prototype

The current code is a prototype that keeps everything in one browser. Its
encryption is real, but it has no server, so it has no key exchange,
ratchet, or multiple devices yet (see README.md, "Known limitations").
Reports about the prototype are still welcome.
