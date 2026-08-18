import sys, json, os, io, contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
V1_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "catan"))

sys.path.insert(0, V1_DIR)
os.chdir(V1_DIR)
from catan2 import read_and_filter_lines, process_game  # noqa: E402

FIXTURES_DIR = os.path.join(HERE, "gamelogs")
OUT_DIR = os.path.join(HERE, "ground_truth")
os.makedirs(OUT_DIR, exist_ok=True)

possible_resources = ["grain", "ore", "wool", "brick", "lumber"]


def camel(trade_type):
    parts = trade_type.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


def build_output(res):
    players = res["players"]
    index_to_player = res["index_to_player"]
    player_order = [index_to_player(i) for i in range(4)]

    resources_per_player = {}
    for p in players:
        resources_per_player[p] = {r: res["resources_per_player"].get((p, r), 0) for r in possible_resources}

    resources_per_player_per_dice = {}
    for (p, r, d), v in res["resources_per_player_per_dice"].items():
        resources_per_player_per_dice.setdefault(p, {}).setdefault(r, {})[str(d)] = v

    steal_map = {}
    for (stealer, victim), v in res["steal_map"].items():
        steal_map.setdefault(stealer, {})[victim] = v

    resources_through_turns = {r: list(v) for r, v in res["resources_through_turns"].items()}

    trades = {}
    for trade_type, per_player in res["trades"].items():
        trades[camel(trade_type)] = {p: list(v) for p, v in per_player.items()}

    return {
        "dice": res["dices"],
        "players": players,
        "playerOrder": player_order,
        "playerPoints": res["player_points"],
        "resourcesPerPlayer": resources_per_player,
        "resourcesPerPlayerPerDice": resources_per_player_per_dice,
        "resourcesThroughTurns": resources_through_turns,
        "turn": res["turn"],
        "stealMap": steal_map,
        "winner": res["winner"],
        "trades": trades,
        "playerDiceRolls": {p: list(v) for p, v in res["player_dice_rolls"].items()},
    }


failures = []
files = sorted(os.listdir(FIXTURES_DIR))
with contextlib.redirect_stdout(io.StringIO()):
    for fname in files:
        path = os.path.join(FIXTURES_DIR, fname)
        lines = read_and_filter_lines(path)
        try:
            res = process_game(lines)
            out = build_output(res)
            with open(os.path.join(OUT_DIR, fname.replace(".txt", ".json")), "w") as f:
                json.dump(out, f)
        except Exception as e:
            failures.append((fname, str(e)))

print(f"done: {len(files)} files, {len(failures)} failures")
for f in failures:
    print(f)
