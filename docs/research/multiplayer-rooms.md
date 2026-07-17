# Multiplayer Sing-off Rooms

Research date: **2026-07-16**. Long-term feature, researched now so today's decisions
don't foreclose it. **Not next** — see [DIRECTION.md](./DIRECTION.md).

---

## 1. Live audio jamming is off the table — the physics decides it

Musicians need roughly **25–30 ms one-way** total to play together. Consumer internet
doesn't clear that, and the reason isn't bandwidth — it's the **tail**, not the median.

Measured reality (all 2024–2026 data):
- **Fiber idle latency: 7–14 ms** — the one solid number here. FCC Measuring
  Broadband America 13th Report (released 2024-08-09, **data collected Sept–Oct
  2022**). Cable 12–24 ms, DSL 23–34 ms.
- **5G: 44 ms** (best carrier, Ookla H2 2025). The "1 ms" figure is a **one-way,
  RAN-only, air-interface design target from a non-binding 3GPP study** — different
  direction, layer, and scope than a ping. On commercial 5G mmWave, the **PHY layer
  alone** meets ≤1 ms only **4.43%** of the time (Fezeu et al., PAM 2023).
- **Wi-Fi is the killer, and it's the hop you control least.** Pei et al., IEEE
  INFOCOM 2016 ([PDF](https://netman.aiops.org/wp-content/uploads/2016/04/main.pdf)),
  47 campus APs over two months: *"more than 50% (10%) of TCP packets suffer from
  WiFi hop latency larger than 20ms (100ms)"* — and in over half of cases the single
  wireless hop **outweighed the entire wired internet path**.
- Under load, Wi-Fi degrades catastrophically. "Ending the Anomaly" (USENIX ATC 2017)
  measured **several hundred ms** under a saturating TCP download on FIFO, and a VoIP
  MOS of **1.00** — total call collapse — for unmarked voice traffic on a stock kernel.

**JackTrip's own guidance** is unambiguous: *"all wireless technologies (Wi-Fi, 5g,
network extenders, wireless headphones, etc.) introduce high latency and jitter, and
will not work well… Plug into ethernet and use wired headphones."*

**Why the tail is what matters:** a jitter buffer must be sized to the *worst* packet.
A 100 ms Wi-Fi tail costs 100 ms of buffer even when the median is 3 ms — and Pei
measured 10% of packets over 100 ms on real access points. One bad tail eats the
entire 25–30 ms budget.

**Conclusion: we are not building live audio jamming.** Not a resourcing call — physics.

---

## 2. Score-only sync: technically sound, socially dead

The design: everyone sings simultaneously against their **own local reference**, audio
never leaves the device, only small score/progress events sync. Latency stops
mattering entirely — it's the standard deterministic-local-simulation pattern. You
could run it over a transport with 800 ms of jitter and the scores would still be correct.

**It works. It's also the wrong product.**

> Six people each singing alone into their own laptop, in silence, watching bars move,
> is not "singing together" — it's Kahoot with a microphone.

And **hymns are the worst possible genre for it**, because hymn-singing is communal by
construction. The entire point is hearing the person next to you find the harmony.
Score-only sync optimizes away the exact thing that makes the activity worth doing.

Failure modes, if we ever did build it:
- **Cheating is trivial and unfixable-in-practice** — the client computes and reports
  its own score. Server-side recompute means shipping the pitch trace, which defeats
  the premise. For friends singing hymns: don't build for it.
- **Local audio/clock coupling is the real bug.** If reference playback runs on
  `AudioContext.currentTime` but grading timestamps use `Date.now()`/
  `performance.now()`, they drift **on the same device** and scores skew. A local bug
  that looks like a networking bug.
- Start-time skew and cross-client clock drift: cosmetic. Don't care.

Precedent: the pattern is everywhere (Kahoot, TypeRacer). **No shipped karaoke/singing
product does score-only simultaneous sync** — Smule's multiplayer is async
duet-stitching, not live. ⚠️ Rhythm-game netcode (Beat Saber, osu!) is widely
*described* this way but **could not be verified from primary sources** — treat as
folklore.

---

## 3. The recommendation: pass-the-mic spectating

**One person sings, everyone else watches their score climb live, then the mic passes.**

**The key insight: one-directional audio has no latency constraint.** Nobody is
jamming — it's broadcast, not interaction. 500 ms to 2 s of delay on the singer's
stream is completely fine. Which means **you can keep the audio**, which means friends
actually hear each other, react, laugh at the flat notes, and heckle.

That's the fun. It's SingStar pass-the-mic / Jackbox structure, and it's the only
design where the group's attention is in one place.

**The honest MVP before that: an async leaderboard.** Everyone sings the same hymn
whenever they want; scores land on a persistent board. Zero sync, zero realtime infra,
zero start coordination — one table and a score row. Not a party, but the most durable
option: people play on their own schedule, which for scattered friends beats "everyone
be online at 7pm Tuesday." Cheapest real thing we can build, and it'll get more use
than expected.

---

## 4. Transport (free tiers verified 2026-07-16)

| | Free tier | Notes |
|---|---|---|
| **Supabase Realtime** | 200 concurrent peak connections, 2M msg/mo, 100 msg/sec, 256KB payload | **Free projects pause after 1 week inactivity**; max 2 active free projects |
| **Firebase RTDB (Spark)** | **100 simultaneous connections — hard cap** | Doesn't pause. Has `ServerValue.TIMESTAMP` + `/.info/serverTimeOffset` built in |
| **PartyKit** | **Could not verify** — no pricing page found | Cloudflare acquired; repo now fronts PartyServer on Durable Objects. Unclear platform commitment. |
| **Liveblocks** | 500 monthly active rooms (snippet only, primary not fetched) | Built for documents/cursors, not score ticks |

Sources: [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits),
[Firebase RTDB limits](https://firebase.google.com/docs/database/usage/limits), both
fetched 2026-07-16.

**Pick: Supabase Realtime broadcast.** Not because it's technically best — Firebase
RTDB is arguably better for tiny high-frequency events and its built-in server-time
offset is a real advantage. But this feature is pure ephemeral broadcast (no tables,
no rows, no RLS, no persistence), Supabase is already the house default, and adding a
second backend for one feature isn't worth it. 200 connections against a party of 6 is
not a constraint we'll ever feel.

⚠️ **Two caveats:**
1. **The 1-week pause is a real risk** for an occasionally-played app — and it's
   **unverified** whether Realtime-only traffic counts as "activity" for the pause
   timer, or whether only DB/API activity does. Test before committing.
2. Supabase Realtime channels are **public by default** — anyone who guesses a room
   code joins, unless Realtime authorization is enabled. Fine for hymns. Know it anyway.

---

## 5. Synchronized start

**Don't build a clock-sync system.** Scoring is local, so start skew is cosmetic.

Minimum viable: host broadcasts `{type:'start', at: hostNow + 3000}`, everyone runs a
3-2-1 countdown, everyone starts. Skew = one-way network delay, ~20–80 ms typical.
Nobody will see it.

If it ever needs tightening, mini-NTP is ~15 lines: send `t0`, peer replies with its
time `ts`, on receipt at `t1` compute `offset = ts - (t0 + (t1-t0)/2)`. Do 5 round
trips and **keep the lowest-RTT sample** (not the average — low-RTT samples are least
contaminated by queueing). Realistic accuracy ±10–50 ms, ±250 ms on the tail.

**Two hard rules regardless:**
- Schedule audio on `AudioContext.currentTime + delta`, **never `setTimeout`**
  (throttled hard in background tabs, jitters ±50 ms in the foreground).
- **Use one clock — the audio clock — for both playback and grading timestamps.**
  This is the drift bug from §2.

---

## 6. Minimum viable room

Room codes without auth, and skip the database entirely:
- 4-char code (excluding `0/O/1/I/L`) → **that is the channel name**:
  `supabase.channel('room-'+code)`
- Display name + stable install UUID in `localStorage`. No accounts, no email.
- **Presence** for the lobby, **broadcast** for events. Three message types:
  `start`, `tick` (progress + score, ~2/sec), `done`.
- Host = first joiner. Host leaves → promote lowest presence timestamp, or just end
  the round. Hobby app.
- Code collisions: ~900k combos, 6 friends. Ignore it.

**Sizing:** async leaderboard = one table + one RLS policy, no realtime at all.
Pass-the-mic room ≈ 200–300 lines against a single channel with zero schema. Both an
afternoon.

## 7. Hard constraint from the audio layer

**YIN is monophonic.** "One phone on the table, four singers doing SATB" is
polyphonic transcription — a different research problem, and no refactoring changes
it. Every room design here assumes **one singer per device**. See
[grading-methodology.md](./grading-methodology.md) §4.

## Could not verify
- Any shipped rhythm/karaoke product's actual score-sync architecture (no public
  primary sources)
- PartyKit's hosted free tier or platform commitment
- Liveblocks limits beyond a search snippet
- Whether Supabase Realtime traffic alone prevents the 1-week free-project pause
