# Recorded TaxiGPT rides

200 freshly generated rides: 100 stress and 100 detour, seed 20260918. All outcomes are retained.
The 16,787 states include move logits and probabilities, true/wrong intersection activations,
position noise, decoded goal bearing, and the effect of independently ablating the compass.

The collection occupies about 19 MB; the dashboard loads individual rides on demand.
`provenance.json` records the model, features, protocol and source hashes. `validation.json`
records independent intervention checks; `integrity.json` summarizes consistency checks.
See [the format guide](../FORMAT.md) for field definitions and reproduction commands.

Stress outcomes: 82 goal arrivals, 9 illegal moves, 9 stops away from the goal.
Detour outcomes: 65 goal arrivals, 25 illegal moves, 10 stops away from the goal.
These illustrative samples are not replacements for the paper’s benchmark estimates.

Some graph nodes lack historical geographic coordinates. Their map positions are interpolated
for display and marked in `manhattan.json`; corresponding geographic bearings remain missing.
Origin-state position readouts are omitted, as in the paper’s diagnostic protocol.
