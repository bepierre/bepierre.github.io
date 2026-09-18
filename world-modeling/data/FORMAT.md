# Explorer data format (draft 0.1)

The explorer is static: it loads one map file once and one ride file on demand. Views never read the
scientific repository; whatever the export pipeline writes in this format is what the page shows.
The default **verified collection** is in `recorded-v1/`. An older demonstration collection, built
by `build_demo_rides.py`, is retained at `?dataset=demo`; its unmeasured fields are tagged `illustrative`.

## Files

```
data/manhattan.json              shared street graph (written once)
data/demo/index.json             the ride list shown in the picker
data/demo/rides/<id>.json        one file per ride
```

The verified collection has the same structure and its own map file. The page defaults to it.

## `manhattan.json`

```
crs      "equirectangular metres centred on the mean intersection; x east, y north; lon scaled by cos(lat0)"
lat0, lon0, bounds [minx, miny, maxx, maxy]
moves    ["E","N","NE","NW","S","SE","SW","W"]
nodes    { "<osm id>": [x, y], ... }          4,452 tokenized intersections with coordinates
edges    [[u, move, v], ...]                    9,351 directed streets (legal moves)
```

Legal moves at a node follow from `edges`; ride files also list them per step for verification.
Bearings everywhere are degrees in the math convention: east = 0, north = 90, counter-clockwise.

## `index.json`

```
schema "taxigpt-explorer.index/0.1", dataset, note, map
rides[]  { id, family, title, category, category_label, outcome, outcome_label,
           n_moves, shortest_hops, recorded_position (bool), file }
```

`family` is `stress`, `detour` (or `in_distribution` later). `category` is the paper's failure class
(`fatal_slip`, `silent`, `full_corruption`, `giveup`) or null. `outcome` is `illegal`, `success` or
`wrong_end` (END emitted away from the goal).

## Ride file

```
schema "taxigpt-explorer.ride/0.1", dataset, id, family, title, category, category_label
origin, goal                       intersection ids
outcome, outcome_label
n_moves                            executed legal moves; the ride has n_moves + 1 states
shortest_hops                      shortest path from origin to goal
model      { checkpoint, architecture }
layers     { position_write, wrong_node, decoded_node, cos_true_wrong, compass_decode, compass_ablation }
generation { temperature, forcing: null | { p, type } }
step_definition                    (text) see below
provenance { "<field>": "recorded ..." | "derived ..." | "illustrative" }
source     { file, sha256, row?, walk_bank, source_index }   where the recording came from
steps[]    one object per state, see below
```

### A step

Step `k` is the state after `k` executed moves, at intersection `traj[k]`, immediately before the model
predicts the next token. Step 0 is the origin (the goal token's position): the paper's readouts start
at the first move token, so its position fields are null and the page says so.

```
step, node, next_node (null at the last state)
dist_to_goal          shortest-path moves from node to goal
goal_bearing_deg      geographic bearing from node to goal (null at the goal)
legal                 legal move tokens at node
prediction {
  logits              { E, N, NE, NW, S, SE, SW, W, END }  (the page shows softmax over these nine)
  proposed            the token the model itself put forward (sampled for stress, arg-max for detour)
  executed            the token appended to the ride: the forced move when forced, else proposed
  forced              bool, detour test overrode the model here
  executed_legal      bool; false only at the illegal attempt that ends a ride (nothing is reached)
}
position {
  write               projection of the mean-centred residual on the true intersection's unit direction
  wrong_node          the intersection (≠ true) whose direction score is highest at this step
  wrong_activation    that score
  decoded_node        arg-max over all intersection directions (true node if write ≥ wrong_activation)
  cos_true_wrong      cosine between the true and wrong unit directions
  noise               rms projection on fixed sampled directions (paper's noise measure)
}
compass {
  decoded_bearing_deg          bearing read off the compass plane
  ablation_delta_logit         { token: original − compass-ablated logit } at the same state, or null
}
```

The strongest wrong node can change identity from step to step; the trace draws its activation, not
one node's history. The compass effect is only meaningful as a same-state comparison between the
original and an intervened forward pass; a bearing alone is not an effect, and the page shows the
effect column only when `ablation_delta_logit` is present.

## Limitations of the older demonstration collection

In `demo/`, the fields from the paper's failure-example artifacts are: trajectory, forced flags, outcome,
`position.write`, `position.wrong_node`, `position.wrong_activation` at layer 18 for the 16 gallery
rides; `cos_true_wrong` from the stored layer-18 centroids; `decoded_node` follows from the scores.

These fields are illustrative or absent in `demo/`; `recorded-v1/` measures them:

1. `prediction.logits` for the nine tokens, and the sampled/greedy `proposed` token at forced steps.
2. The attempted illegal token at the final state of illegal rides.
3. `compass.decoded_bearing_deg` (layer 16 readout, or whichever layer is chosen).
4. `compass.ablation_delta_logit`: original minus compass-ablated logits at the same state (the paper's
   layer-18 plane removal), kept separate from the recorded trajectory.
5. `position.noise` (the paper's rms measure), if it is to be shown.
6. Position readouts for successful and in-distribution rides (the two demo successes are illustrative).
7. A recording of the origin state if a readout there is wanted; otherwise it stays null.

The verified collection uses full-vocabulary probabilities, displays measured noise, and retains
all 100 stress and 100 detour rides. Ordinary in-distribution rides are not yet included.

## Verified collection: `recorded-v1/`

The default explorer now loads `recorded-v1/index.json` and its `manhattan.json`.
The design demonstration remains available with `?dataset=demo`.
The verified exporter lives in the scientific repository at `experiments/explorer/`:

```
python -m experiments.explorer --stress 100 --detour 100 --output /path/to/world-modeling/data/recorded-v1
python -m experiments.explorer.validate /path/to/world-modeling/data/recorded-v1
```

All generated rides are kept, including failures and generation limits. Seed 20260918 is fixed
before generation. Stress pairs use the paper's released-distance matching; detour pairs come
from held-out origin–goal prompts. This is an exploratory collection, not a benchmark estimate.

Each recorded step adds `prediction.probabilities`, normalized over the **full vocabulary**, and
`prediction.other_probability` for tokens not shown. The page uses these directly instead of
renormalizing over the nine displayed tokens. `prediction.full_vocab_argmax` records the greedy
choice; stress `proposed` is the actual sampled token. A forced detour can override END away from
the destination. Forcing only considers legal moves that satisfy the original remaining-budget
reachability rule; consequently, the forced move need not be the least likely among *all* legal moves.

For an outcome of `nonterm` (generation limit), the final state's proposed/executed token is null:
its readouts are recorded, but no further generation decision was made. The last illegal attempt
and every forced flag are recorded directly, not reconstructed from a chosen wrong intersection.

Compass ablation removes the orthogonal compass plane at layer 18 from the current token only.
It preserves the original preceding states and never drives the recorded trajectory. The export
also includes `compass.ablated_probabilities` with the same full-vocabulary normalization.
Layer-16 compass decoding uses the fixed fitting mean, without oracle position centering.

The map contains all available geographic nodes and fills missing historical graph-node locations
by harmonic interpolation from neighboring known coordinates. These display-only estimates are
listed in `manhattan.json` under `approximate_nodes`; they are not used to calculate geographic
bearing. A null `goal_bearing_deg` can mean either arrival or unavailable coordinates, distinguished
by `goal_bearing_status`. Position decoding still includes all cached intersection directions.

`provenance.json` records seeds, code/input hashes, measurement layers via the ride files, and the
96 fixed sampled feature directions used for the RMS noise readout. `validation.json` records
agreement with independent full-prefix interventions. `integrity.json` summarizes the offline
schema and numerical consistency checks. No full residual streams or model weights are shipped.
