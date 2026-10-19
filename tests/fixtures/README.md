# tests/fixtures

`aws-meetup-vienna-53.html` is the public Meetup page of AWS Meetup Vienna
#53, <https://www.meetup.com/amazon-web-services-aws-vienna/events/316893745/>,
saved on 16 October 2026. The tests read its JSON-LD `Event` and the
description markdown in `__NEXT_DATA__`, nothing else.

Scrubbed on 16 October 2026, before the first commit:

- removed the `next_csrf` (session token), `sentry-trace` and `baggage` meta
  tags, and emptied `_sentryTraceData` and `_sentryBaggage` in `__NEXT_DATA__`,
- replaced the event hosts' Meetup member ids with `1` to `4` and their
  member photo ids with `11` to `13` (`EventHost`, `memberId`, `PhotoInfo`).

The file's modification time was kept at the save time, because meetup-sync
uses it as `source.fetchedAt` for a saved page. A page saved again from a
browser, especially a logged-in one, carries tokens and account data: scrub it
the same way before committing it here.

`sessionize-all.sample.json` and `sessionize-embed.sample.html` are
hand-written test data in the shape of Sessionize's two endpoint formats (the
`view/All` JSON and the embed's HTML from `view/Speakers?under=True`). The
names are this event's speakers so the titles match; the taglines, bios and
image URLs are made up. No real Sessionize response is stored here.
