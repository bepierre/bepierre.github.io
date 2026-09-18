# Explorer data format (draft 0.1)

The explorer is static: it loads one map file once and one ride file on demand. Views never read the
scientific repository; whatever the export pipeline writes in this format is what the page shows.
The prototype ships a **demonstration dataset** built by `build_demo_rides.py`; every field it did not
take from a recording is tagged `illustrative` and the page shows that tag beside the value.

## Files

```
data/manhattan.json              shared street graph (written once)
data/demo/index.json             the ride list shown in the picker
data/demo/rides/<id>.json        one file per ride
```

A verified collection replaces `demo/` with, for example, `v1/` and the page's `DATA` constant
(`js/app.js`) points at it.

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

## What the verified export still has to provide

Recorded today (from the paper's failure-example artifacts): trajectory, forced flags, outcome,
`position.write`, `position.wrong_node`, `position.wrong_activation` at layer 18 for the 16 gallery
rides; `cos_true_wrong` from the stored layer-18 centroids; `decoded_node` follows from the scores.

Still needed per step, per ride, with the measuring layer stated:

1. `prediction.logits` for the nine tokens, and the sampled/greedy `proposed` token at forced steps.
2. The attempted illegal token at the final state of illegal rides.
3. `compass.decoded_bearing_deg` (layer 16 readout, or whichever layer is chosen).
4. `compass.ablation_delta_logit`: original minus compass-ablated logits at the same state (the paper's
   layer-18 plane removal), kept separate from the recorded trajectory.
5. `position.noise` (the paper's rms measure), if it is to be shown.
6. Position readouts for successful and in-distribution rides (the two demo successes are illustrative).
7. A recording of the origin state if a readout there is wanted; otherwise it stays null.

Decisions still open: whether probabilities should be normalised over the nine shown tokens or the
full vocabulary; whether noise is shown by default; the selection rule and seeds for the ~30 + 30
collection; whether ordinary in-distribution rides are included.
