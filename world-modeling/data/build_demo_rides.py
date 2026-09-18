"""Build the DEMONSTRATION dataset for the TaxiGPT explorer prototype.

This is not the verified export pipeline. It assembles a small ride set for design work:

* geometry, trajectories, forcing flags and outcomes are recorded (from the paper's walk banks);
* the layer-18 true-position write, the strongest wrong-node activation and its identity are recorded
  (from ``failure_examples*.json``) for the 16 failure-gallery rides;
* the cosine between the true and wrong intersection directions is computed from the stored layer-18
  centroids, and the decoded node follows from the two recorded direction scores;
* everything else (move logits, the proposed move at forced steps, the attempted illegal token, the
  decoded compass bearing, the compass-ablation effect, the position-noise value, and every
  mechanistic value of the two successful rides) is ILLUSTRATIVE: generated deterministically from the
  geometry so the views have something to show. Each field carries its provenance in the ride file and
  the interface labels illustrative values as such.

Run from the website repo with the scientific repo available:

    WM_EVAL=/workspace/world-model-evaluation python3 world-modeling/data/build_demo_rides.py

Writes ``world-modeling/data/demo/index.json`` and one file per ride under ``demo/rides/``.
The format is documented in ``FORMAT.md`` next to this script.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVAL = Path(os.environ.get("WM_EVAL", "/workspace/world-model-evaluation"))
sys.path.insert(0, str(EVAL))
os.chdir(EVAL)

import numpy as np  # noqa: E402
import torch  # noqa: E402
from common.world import World  # noqa: E402
from common.geometry import load_latlon  # noqa: E402

EXAMPLES = EVAL / "investigate" / "median_examples_20260914"
LAYER = 18
MOVES = ["E", "N", "NE", "NW", "S", "SE", "SW", "W"]
MOVE_ANGLE = {"E": 0, "NE": 45, "N": 90, "NW": 135, "W": 180, "SW": 225, "S": 270, "SE": 315}
CATEGORY_LABEL = {
    "fatal_slip": "fatal superposition slip",
    "silent": "silent slip",
    "full_corruption": "full corruption",
    "giveup": "give-up slip",
}
OUTCOME_LABEL = {"illegal": "illegal move", "success": "reached goal", "wrong_end": "stopped off goal"}

SCHEMA_RIDE = "taxigpt-explorer.ride/0.1"
SCHEMA_INDEX = "taxigpt-explorer.index/0.1"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wrap(deg: float) -> float:
    return (deg + 180.0) % 360.0 - 180.0


# ── geometry ─────────────────────────────────────────────────────────────────────
world = World.load()
latlon = load_latlon()
nodes = [n for n in world.nodes if n in latlon]
node_set = set(nodes)
lat0 = sum(latlon[n][0] for n in nodes) / len(nodes)
lon0 = sum(latlon[n][1] for n in nodes) / len(nodes)
K = 111.32e3
COS0 = math.cos(math.radians(lat0))


def xy(n):
    la, lo = latlon[n]
    return (lo - lon0) * COS0 * K, (la - lat0) * K


def bearing_deg(u, v) -> float:
    """Bearing from u to v in degrees, math convention (E = 0, N = 90, counter-clockwise)."""
    ux, uy = xy(u)
    vx, vy = xy(v)
    return math.degrees(math.atan2(vy - uy, vx - ux))


def move_between(u, v):
    for m in world.tokenized_moves(u):
        if world.neighbor(u, m) == v:
            return m
    raise ValueError(f"no street from {u} to {v}")


# ── layer-18 intersection directions (for the true/wrong cosine) ────────────────
cent = torch.load(EXAMPLES / "centroids" / f"centroid_L{LAYER}.pt", map_location="cpu", weights_only=False)
cent_ids = [int(i) for i in cent["node_ids"]]
cent_index = {n: i for i, n in enumerate(cent_ids)}
U = cent["centroids"].double() - cent["global_mean"].double()
U = (U / U.norm(dim=1, keepdim=True)).numpy()


def cos_between(a, b) -> float | None:
    if a not in cent_index or b not in cent_index:
        return None
    return float(U[cent_index[a]] @ U[cent_index[b]])


def most_similar_node(n):
    """The intersection whose direction is closest to n's (used only for illustrative rides)."""
    if n not in cent_index:
        return None
    s = U @ U[cent_index[n]]
    s[cent_index[n]] = -np.inf
    return cent_ids[int(np.argmax(s))]


# ── illustrative generators (deterministic per ride) ─────────────────────────────
class Illustrator:
    def __init__(self, seed: str):
        self.rng = random.Random(seed)

    def gauss(self, mu, sigma):
        return self.rng.gauss(mu, sigma)

    def uniform(self, a, b):
        return self.rng.uniform(a, b)

    def compass_bearing(self, goal_bearing):
        # the paper reports a median decode error of about 18 degrees at layer 16
        return wrap(goal_bearing + self.gauss(0, 20))

    def logits(self, legal, compass, at_goal):
        out = {}
        for m in MOVES:
            base = 3.0 if m in legal else -3.5
            goalward = 1.2 * math.cos(math.radians(MOVE_ANGLE[m] - compass))
            out[m] = base + goalward + self.gauss(0, 0.6)
        out["END"] = (4.5 if at_goal else -5.0) + self.gauss(0, 0.5)
        return out

    def ablation_delta(self, compass):
        d = {m: 0.9 * math.cos(math.radians(MOVE_ANGLE[m] - compass)) + self.gauss(0, 0.15) for m in MOVES}
        d["END"] = 0.0
        return d


def choose_illegal_attempt(true_node, decoded_node, rng: random.Random):
    """A move that is illegal at the true intersection, preferring one that is legal at the decoded one
    (the paper's mechanism: the wrong active feature supplies the move). Illustrative."""
    legal_true = set(world.tokenized_moves(true_node))
    illegal = [m for m in MOVES if m not in legal_true]
    if decoded_node is not None and decoded_node in node_set:
        supplied = [m for m in illegal if m in world.tokenized_moves(decoded_node)]
        if supplied:
            return rng.choice(supplied)
    return rng.choice(illegal)


# ── ride assembly ────────────────────────────────────────────────────────────────
def build_ride(rid, family, walk, series, category, source, seed):
    """series: dict(true, wrong, wrong_node) aligned with traj[1:], or None (illustrative)."""
    ill = Illustrator(seed)
    traj = walk["traj"]
    o, g = walk["o"], walk["g"]
    outcome = walk["outcome"]
    forced = walk.get("forced") or [0] * len(traj)
    n = len(traj) - 1                       # legal moves executed before the last state
    greedy = family == "detour"
    recorded = series is not None

    if not recorded:
        # a smooth illustrative write/wrong pair, in the units of the recorded ones
        w = 430.0
        tr, wr, wn = [], [], []
        for k in range(1, len(traj)):
            w = 0.85 * w + 0.15 * 430 + ill.gauss(0, 28)
            tr.append(w)
            wr.append(0.72 * w + ill.gauss(0, 30))
            wn.append(most_similar_node(traj[k]) or traj[k - 1])
        series = {"true": tr, "wrong": wr, "wrong_node": wn}

    steps = []
    for k, node in enumerate(traj):
        legal = list(world.tokenized_moves(node))
        gb = bearing_deg(node, g) if node != g else None
        compass = ill.compass_bearing(gb if gb is not None else 0.0)
        last = k == n
        at_goal = node == g
        logits = ill.logits(legal, compass, at_goal and last)

        # what happened at this state
        if not last:
            executed = move_between(node, traj[k + 1])
            is_forced = bool(forced[k]) if k < len(forced) else False
        else:
            is_forced = False
            if outcome == "illegal":
                executed = None  # filled below once the decoded node is known
            elif outcome == "success":
                executed = "END"
            else:                          # wrong_end: END emitted away from the goal
                executed = "END"

        # position code (recorded for k >= 1 in the gallery rides)
        if k == 0:
            position = {"write": None, "wrong_node": None, "wrong_activation": None,
                        "decoded_node": None, "cos_true_wrong": None, "noise": None}
        else:
            tw, ww, wnode = series["true"][k - 1], series["wrong"][k - 1], int(series["wrong_node"][k - 1])
            decoded = node if tw >= ww else wnode
            position = {"write": round(tw, 2), "wrong_node": wnode, "wrong_activation": round(ww, 2),
                        "decoded_node": decoded, "cos_true_wrong": (None if (c := cos_between(node, wnode)) is None else round(c, 4)),
                        "noise": round(max(30.0, ill.gauss(62, 7)), 1)}

        if executed is None:               # the attempted illegal token
            executed = choose_illegal_attempt(node, position["decoded_node"], ill.rng)

        # make the illustrative logits consistent with what happened
        legal_vals = [logits[m] for m in legal] or [0.0]
        if is_forced:
            logits[executed] = min(legal_vals) - ill.uniform(0.2, 1.0)
            proposed = max((m for m in logits if m != executed), key=logits.get)
        elif executed == "END":
            logits["END"] = max(logits.values()) + ill.uniform(0.5, 1.5)
            proposed = "END"
        elif last and outcome == "illegal":
            bump = ill.uniform(0.3, 1.5) if greedy else ill.uniform(-0.5, 1.0)
            logits[executed] = max(legal_vals) + bump
            proposed = executed
        else:
            bump = ill.uniform(0.2, 1.2) if greedy else ill.uniform(-1.0, 1.2)
            logits[executed] = max(legal_vals) + bump
            proposed = executed
        if greedy and not is_forced:
            proposed = max(logits, key=logits.get)   # greedy: the proposal is the arg-max by construction
            if proposed != executed and not (last and outcome == "illegal"):
                logits[executed] = max(logits.values()) + 0.3
                proposed = executed

        executed_legal = executed in legal or (executed == "END")
        steps.append({
            "step": k,
            "node": node,
            "next_node": traj[k + 1] if not last else None,
            "dist_to_goal": world.hop(node, g),
            "goal_bearing_deg": None if gb is None else round(gb, 1),
            "legal": legal,
            "prediction": {
                "logits": {m: round(v, 3) for m, v in logits.items()},
                "proposed": proposed,
                "executed": executed,
                "forced": is_forced,
                "executed_legal": executed_legal,
            },
            "position": position,
            "compass": {
                "decoded_bearing_deg": round(compass, 1),
                "ablation_delta_logit": {m: round(v, 3) for m, v in ill.ablation_delta(compass).items()},
            },
        })

    prov = {
        "trajectory": "recorded", "forced": "recorded", "outcome": "recorded",
        "dist_to_goal": "derived (shortest path on the street graph)",
        "goal_bearing_deg": "derived (geographic bearing to the goal)",
        "legal": "derived (street graph)",
        "position.write": "recorded (layer 18)" if recorded else "illustrative",
        "position.wrong_node": "recorded (layer 18)" if recorded else "illustrative",
        "position.wrong_activation": "recorded (layer 18)" if recorded else "illustrative",
        "position.decoded_node": "derived (arg-max of the two recorded direction scores)" if recorded else "illustrative",
        "position.cos_true_wrong": "derived (layer-18 centroid directions)" if recorded else "illustrative",
        "position.noise": "illustrative",
        "prediction.logits": "illustrative",
        "prediction.proposed": "illustrative at forced steps; otherwise the recorded executed move",
        "prediction.executed": "recorded, except the attempted illegal token, which is illustrative",
        "compass.decoded_bearing_deg": "illustrative",
        "compass.ablation_delta_logit": "illustrative",
    }
    return {
        "schema": SCHEMA_RIDE,
        "dataset": "demo",
        "id": rid,
        "family": family,
        "title": f"{'Stress' if family == 'stress' else 'Detour'} ride {'· ' + CATEGORY_LABEL[category] if category else '· ' + OUTCOME_LABEL[outcome]}",
        "category": category,
        "category_label": CATEGORY_LABEL.get(category),
        "origin": o,
        "goal": g,
        "outcome": outcome,
        "outcome_label": OUTCOME_LABEL[outcome],
        "n_moves": n,
        "shortest_hops": world.hop(o, g),
        "model": {"checkpoint": "TaxiGPT random-walks (Vafa et al.)", "architecture": "GPT2-XL, 48 layers x 1600"},
        "layers": {"position_write": LAYER, "wrong_node": LAYER, "decoded_node": LAYER,
                   "cos_true_wrong": LAYER, "compass_decode": 16, "compass_ablation": 18},
        "generation": ({"temperature": 1.0, "forcing": None} if family == "stress"
                       else {"temperature": 0.0, "forcing": {"p": 0.75, "type": "least_likely"}}),
        "step_definition": "step k is the state after k executed moves, at traj[k], immediately before the model predicts the next token; step 0 has no recorded position readout",
        "provenance": prov,
        "source": source,
        "steps": steps,
    }


def main():
    out_dir = HERE / "demo"
    (out_dir / "rides").mkdir(parents=True, exist_ok=True)
    rides = []

    for family, fname, bank in (("stress", "failure_examples.json", "challenge_walks.json"),
                                ("detour", "failure_examples_detour.json", "detour_walks.json")):
        path = EVAL / "generated" / fname
        data = json.loads(path.read_text())
        for i, row in enumerate(data["rows"]):
            rid = f"{family}-{row['category'].replace('_', '-')}-{row['source_index']}"
            src = {"file": str(path.relative_to(EVAL)), "sha256": sha256(path), "row": i,
                   "walk_bank": bank, "source_index": row["source_index"]}
            rides.append(build_ride(rid, family, row["walk"],
                                    {"true": row["true"], "wrong": row["wrong"], "wrong_node": row["wrong_node"]},
                                    row["category"], src, seed=rid))

    # two successful rides so the reached-goal / END states exist; their readouts are illustrative
    for family, bank in (("stress", "challenge_walks.json"), ("detour", "detour_walks.json")):
        path = EXAMPLES / bank
        walks = json.loads(path.read_text())["walks"]
        # the first successful walk of 30-60 moves whose every intersection has coordinates
        idx, w = next((i, w) for i, w in enumerate(walks)
                      if w["outcome"] == "success" and 30 <= len(w["traj"]) <= 60
                      and all(n in node_set for n in w["traj"]) and w["g"] in node_set
                      and (family == "stress" or sum(w["forced"]) >= 8))
        assert w["traj"][-1] == w["g"], (family, idx)
        rid = f"{family}-success-{idx}"
        src = {"file": str(path.relative_to(EVAL)), "sha256": sha256(path), "walk_bank": bank, "source_index": idx}
        rides.append(build_ride(rid, family, w, None, None, src, seed=rid))

    index = {"schema": SCHEMA_INDEX, "dataset": "demo",
             "note": "Demonstration data for design review. Fields tagged 'illustrative' in each ride's provenance are "
                     "generated, not measured. See FORMAT.md.",
             "map": "../manhattan.json",
             "rides": []}
    for r in rides:
        (out_dir / "rides" / f"{r['id']}.json").write_text(json.dumps(r, separators=(",", ":")))
        index["rides"].append({"id": r["id"], "family": r["family"], "title": r["title"], "category": r["category"],
                               "category_label": r["category_label"], "outcome": r["outcome"],
                               "outcome_label": r["outcome_label"], "n_moves": r["n_moves"],
                               "shortest_hops": r["shortest_hops"],
                               "recorded_position": r["provenance"]["position.write"].startswith("recorded"),
                               "file": f"rides/{r['id']}.json"})
    (out_dir / "index.json").write_text(json.dumps(index, indent=1))
    print(f"wrote {len(rides)} rides to {out_dir}")
    for r in rides:
        s = r["steps"][-1]
        print(f"  {r['id']:36s} {r['n_moves']:3d} moves  {r['outcome']:9s} last: executed={s['prediction']['executed']} "
              f"legal={s['prediction']['executed_legal']} decoded={s['position']['decoded_node']==s['node']}")


if __name__ == "__main__":
    main()
