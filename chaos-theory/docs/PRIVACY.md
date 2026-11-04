# Privacy in plain language

You can play without an account. There are no trackers, third-party fonts, analytics, remote scores, automatic uploads, or model calls.

This browser saves your best scores, a short score/seed history, cosmetic choice, and settings. Options → Delete local scores & settings removes them. If storage is blocked, you can still play.

Local research capture is off by default. If enabled, synthetic sign events, mission, seed, duration in ticks, and a random run identifier stay in memory for this session. No free-text names, precise location, wall-clock play timestamps, or personal identifiers are requested. Closing or reloading clears these records. Turning capture off deletes the current records. A replay export contains synthetic game inputs, not keystrokes outside gameplay.

Export saves a JSON file to your device. It does not donate data. You control whether to share it and how to delete it. Delete exported files separately if you no longer want them.

The optional operator-only model command can send a selected synthetic scenario to the configured provider and incur charges. This is never enabled by merely playing, exporting, or running fixture tests. API keys stay in the operator's local environment. Provider data handling depends on that provider; `store:false` is requested but is not a guarantee about all retention. Do not add personal or secret data to research records.

No human study, ethics/IRB approval, or legal review has occurred. A future study must separately explain donation, retention, access, withdrawal, age eligibility and consent before collecting anything. This notice is an engineering description, not a claim of legal approval.

The optional Play & give feedback recorder is independent of research scenario capture. It keeps at most 20 local observations in memory, with event timings, game choices and optional fixed-choice answers. It records no raw key log or name and never uploads. Its export is a deliberate download; Stop & delete or reload clears it. Automated test exports are marked synthetic. Local records do not attest a human identity.

In v0.4, local progress also includes six optional job stamps and lesson completion. The first-delivery lesson is excluded from scored heist history, local observation reports and research mappings.

The fake-notice desk stores an editable draft only in the current screen. Making a downloadable pack requires explicit consent; attaching the last heist replay is a separate checkbox and includes only game inputs and the game seed. Exports include the exact text you type, so keep personal, private and secret information out. Nothing uploads. Clear or leave to discard a draft; delete downloaded files separately. The pack's purpose is evaluation only, not training permission. The separately opted-in operator CLI can send that selected notice to a provider; its explicit execution notice warns that text leaves the device. Offline checking never sends it.
