#!/usr/bin/env python3
"""I2 mechanism x protocol x blocker matrix for ca-rebound (coder job cdfa).
603 cells from spec_I2.json (frozen SPEC); reps=64, seed=0.
Appends per-cell JSON; rewrites matrix.csv every 20 cells; resumable via sim_id.
"""
import sys, os, json, time, re, csv

sys.path.insert(0, "/root/research-work/ca-rebound")
import nbsim

SIM = "/root/research-work/ca-rebound/sim"
CSV = os.path.join(SIM, "matrix.csv")
SPEC = json.load(open(os.path.join(SIM, "spec_I2.json"), encoding="utf-8"))
BLOCKS = ["none", "TEA", "Cd", "XE991"]
POOL, HO = SPEC["pool"], SPEC["heldout"]
MECHS = SPEC["mechs"]
BNAMES = dict(SPEC["blocks"])


def sanitize(s):
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")


def build_cells():
    cells = []
    for mech in MECHS:
        for b in BLOCKS:
            for pi, lab in enumerate(POOL, 1):
                cells.append((mech, lab, 0, pi, b))
            for pi, lab in enumerate(HO, 1):
                cells.append((mech, lab, 1, pi, b))
    for mech in SPEC["ttx_mechs"]:
        cells.append((mech, SPEC["ttx_proto"], 0, SPEC["ttx_pi_pool"], "TTX"))
    assert len(cells) == 603, len(cells)
    return cells


def main():
    cells = build_cells()
    # reversible filename map: label -> safe token (injective)
    mapping = {lab: sanitize(lab) for lab in sorted(set(POOL + HO))}
    vals = list(mapping.values())
    assert len(vals) == len(set(vals)), "filename collision"
    with open(os.path.join(SIM, "filename_map.json"), "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1, sort_keys=True)

    rows, done = [], set()
    if os.path.exists(CSV):
        with open(CSV, encoding="utf-8", newline="") as f:
            rdr = csv.reader(f)
            header = next(rdr)
            assert header == ["mech", "label", "is_heldout", "block", "reps", "seed", "mean", "sd", "sim_id"]
            for parts in rdr:
                if len(parts) == 9:
                    done.add(parts[8])
        if done:
            with open(CSV, encoding="utf-8", newline="") as f:
                rows = [l.rstrip("\n") for l in f][1:]
        print("[resume] %d cells already done" % len(done), flush=True)

    t0 = time.time()
    since = 0
    for mech, lab, is_ho, pi, b in cells:
        kind = "ho" if is_ho else "pool"
        sid = "cdfa-%s-%s-%02d-%s" % (mech, kind, pi, b)
        if sid in done:
            continue
        lab2, seg = nbsim.protocol(lab)
        r = nbsim.simulate(MECHS[mech], (lab2, seg),
                           reps=SPEC["reps"], seed=SPEC["seed"],
                           block=tuple(SPEC["blocks"][b]))
        rec = {"mechanism": MECHS[mech], "label": lab,
               "block": list(SPEC["blocks"][b]), "reps": SPEC["reps"],
               "seed": SPEC["seed"], "counts_mean": float(r["mean"]),
               "counts_sd": float(r["sd"]), "nbsim_sha256": SPEC["nbsim_sha256"]}
        with open(os.path.join(SIM, sid + ".json"), "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False)
        import io
        buf = io.StringIO()
        csv.writer(buf, lineterminator="").writerow(
            [mech, lab, str(is_ho), b, str(SPEC["reps"]), str(SPEC["seed"]),
             repr(float(r["mean"])), repr(float(r["sd"])), sid])
        rows.append(buf.getvalue())
        since += 1
        print("[%3d/603] %s mean=%8.3f sd=%7.3f (+%4.0fs)" % (len(rows), sid, r["mean"], r["sd"], time.time()-t0), flush=True)
        if since >= 20:
            with open(CSV, "w", encoding="utf-8") as f:
                f.write("mech,label,is_heldout,block,reps,seed,mean,sd,sim_id\n")
                f.write("\n".join(rows) + "\n")
            since = 0
            print("[flush] %d cells" % len(rows), flush=True)

    with open(CSV, "w", encoding="utf-8") as f:
        f.write("mech,label,is_heldout,block,reps,seed,mean,sd,sim_id\n")
        f.write("\n".join(rows) + "\n")
    print("[done] rows=%d elapsed=%ds" % (len(rows), time.time()-t0), flush=True)


if __name__ == "__main__":
    main()
