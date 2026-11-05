# Odd Post: a tiny postal heist

Chaos Theory's featured game has a simple commercial pitch: **steal three parcels, outsmart predictable robots, catch the last tram**. The market-facing promise is a readable arcade heist with funny physical consequences. Research is optional and comes after the player understands the game.

This is an implemented review prototype, not a claim of market fit. No people have playtested it yet. The design aims for satisfying voluntary replay; whether it achieves that needs observation.

## The first minute

Play now starts the full 75-second night shift. New players can instead choose Learn with one delivery. This is an actual interactive lesson in the same depot: move to the notice, change it with Fake notice, meet the courier, pick up the parcel with E, and deliver it to the hideout. The shortcut is open and other staff are off duty. The lesson allows up to five minutes and causes no damage. Each instruction follows the player's actual progress, not elapsed tutorial slides. A successful lesson leads directly to the full heist.

A lesson is explicitly separate from a scored heist. It cannot earn job stamps, score history, official bests, research mappings or playtest outcomes. Its distinct replay mode is checked during independent replay. A practice replay cannot be relabeled as a heist and keep matching checksums.

The player should learn three facts through action: the parcel has to be brought home; gadgets affect real things; and the robots react to changes in the world. The full heist then adds guards, an optional express sorter and a final tram deadline. Goal text stays visible above the arena, with the next destination marked in the world.

Reviewers can also download a single-file offline build, extract it and open it in Chrome or Firefox. It includes the game and licenses, requires no setup or account, and makes no automatic uploads. That removes an installation obstacle before asking newcomers to test the game. It does not establish compatibility on all devices or market readiness.

## Reasons for another round

All four gadgets are available from the start. Foam blaster, Doughnut decoy, Remote switch and Fake notice describe what they do. Their interactions remain physical: a reversed belt moves a stunned guard; a loose parcel can jam at a gate; a mechanic can undo the player's tampering. Clear reactions and sound effects make these outcomes readable.

Six optional job stamps encourage mastery of the same mission:

| Job               | Actual completion condition                              |
| ----------------- | -------------------------------------------------------- |
| Clock off         | Three parcels and a successful tram escape               |
| Express delivery  | Escape after the second-haul sorter route                |
| Smooth operator   | Escape with no damage and three hearts                   |
| Two ways to steal | Escape after actual redirection and interception         |
| Return to sender  | Escape after the physical decoy/reversed-belt/foam combo |
| No shots fired    | Escape without using foam                                |

These are computed from the completed heist state. Selecting a job does not grant success, change guard behavior or silently change tool permissions. Players can retry the same seed, choose another job, or play without an extra goal. Stamps and lesson completion are saved locally alongside existing scores. Earlier scores and cosmetics are retained. There are no paid unlocks, streak penalties or expiring rewards.

## An optional contribution, not a game interruption

Help test AI opens a fictional notice desk. The player can write a new lower-trust message for one of three fixed tasks: deliver a parcel, open a gate, or inspect before repair. Suggestions help a first-time author begin, and the notice can be edited freely within a small text limit. The trusted order is always visible and cannot be edited.

The safety-lock buttons execute actual programmed requests against the local guard. They do not claim that an AI read the note. An approved request completing and a prohibited request being blocked are useful demonstrations of the boundary, not evidence about a language model's behavior.

Checking and downloading a research export requires an explicit checkbox. Attaching a finished heist replay is a separate choice. Nothing uploads, names are not requested, and users are told to keep private information out of their notices. The pack is for evaluation only; it does not grant model-training permission. Leaving or clearing the screen discards the local draft. A downloaded file remains the user's responsibility.

## What would count as progress

Before adding more missions, observe 5–8 consenting newcomers. Record assistance separately. Look for an understood goal, an unassisted first trick, discovery of another tactic, reasons for quitting and voluntary retry. Keep failures and abandoned runs. The existing local feedback flow supports descriptive observations; it does not authenticate a human or prove enjoyment.

Test real phones, accessibility and subjective sound quality separately. The current automated runs establish functioning mechanics, bounded records and reproducibility on tested engines. They cannot establish fun, addictiveness, retention, ethical approval or research effectiveness.
