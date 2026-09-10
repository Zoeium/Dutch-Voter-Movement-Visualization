#!/usr/bin/env python3
"""
Fetch public DPES/NKO voter movement data from the DANS SSH Data Stations
Dataverse repository and write YAML files matching the project's existing format.

Datasets:
  2025: https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/SS/ZBNO8O
  2023: https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/SS/D62YTH
  2021: https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/DANS-XCY-AC9Q
  2017: https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/DANS-XBY-5DHS

Each dataset contains a survey with variables:
  V070  — Voted in previous election (1=Yes, 2=No, 3=Not eligible)
  V071  — Party voted for in previous election
  V160  — Voted in current election (1=Yes, 2=No)
  V163  — Party voted for in current election

The party codes differ per year (see CODE_MAPS below).

NOTE: The 2025 VEDPES file is publicly accessible. The 2023, 2021, and 2017
data files are restricted and require an API token obtained by registering
on the Dataverse instance and requesting access. Pass the token via
--api-token or the DATAVERSE_API_TOKEN environment variable.

Usage:
    python3 scripts/fetch_voter_movements.py                    # fetch 2025 (public)
    python3 scripts/fetch_voter_movements.py --year 2023 --api-token TOKEN
    python3 scripts/fetch_voter_movements.py --year all --api-token TOKEN
    npm run fetch-data                                           # runs the 2025 default

Requires: pandas, pyreadstat, pyyaml
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
import pyreadstat
import yaml


# ── Dataverse configuration ──────────────────────────────────────────────

DATAVERSE_URL = "https://ssh.datastations.nl"

DATASETS = {
    "2025": {
        "pid": "doi:10.17026/SS/ZBNO8O",
        "file_id": 621941,  # VEDPES (public)
        "source_name": "Dutch Parliamentary Election Study 2025 (DPES/NKO 2025)",
    },
    "2023": {
        "pid": "doi:10.17026/SS/D62YTH",
        "file_id": 614679,  # NKO2023 Representative (restricted)
        "source_name": "Dutch Parliamentary Election Study 2023 (DPES/NKO 2023)",
    },
    "2021": {
        "pid": "doi:10.17026/DANS-XCY-AC9Q",
        "file_id": 25759,  # DPES2021 v2.0.sav (restricted)
        "source_name": "Dutch Parliamentary Election Study 2021 (DPES/NKO 2021)",
    },
    "2017": {
        "pid": "doi:10.17026/DANS-XBY-5DHS",
        "file_id": 4302,  # DPES 2017 v1.5.sav (restricted)
        "source_name": "Dutch Parliamentary Election Study 2017 (DPES/NKO 2017)",
    },
}


# ── Party code mappings per year ─────────────────────────────────────────
# Maps numeric codes in the Stata/SPSS file to the party IDs used in this project.
# The "previous election" and "current election" use the SAME code map within
# a given year, but the maps differ BETWEEN years.
#
# Codes not listed here (blank, invalid, DK, won't say, INAP) are excluded.
# "Other" is the catch-all for small parties not in the main list.

CODE_MAP_2025 = {
    1: "pvv",
    2: "glpvda",
    3: "vvd",
    4: "nsc",
    5: "d66",
    6: "bbb",
    7: "cda",
    8: "sp",
    9: "christenunie",
    10: "denk",
    11: "fvd",
    12: "pvdd",
    13: "sgp",
    14: "volt",
    15: "ja21",
    16: "50plus",
    19: "other",
}

CODE_MAP_2023 = {
    # V071 (previous = 2021) and V163 (current = 2023) share the same codes
    # V071 codes (vote in 2021):
    1: "vvd",
    2: "d66",
    3: "pvv",
    4: "cda",
    5: "sp",
    6: "pvda",        # PvdA (pre-merger)
    7: "groenlinks",  # GroenLinks (pre-merger)
    8: "fvd",
    9: "pvdd",
    10: "christenunie",
    11: "volt",
    12: "ja21",
    13: "sgp",
    14: "denk",
    15: "50plus",
    16: "bbb",
    17: "bij1",
    18: "other",
    # V163 codes (vote in 2023) — same parties but different ordering:
    # 1=VVD, 2=D66, 3=PvdA/Groenlinks, 4=PVV, 5=CDA, 6=SP, 7=FvD, 8=PvdD,
    # 9=ChristenUnie, 10=Volt, 11=JA21, 12=SGP, 13=DENK, 14=50Plus, 15=BBB,
    # 16=Bij1, 17=NSC, 18=BVNL, ...
    # We handle this via separate maps for V071 vs V163 below.
}

# 2023: V071 (vote in 2021) party codes
CODE_MAP_2023_PREV = {
    1: "vvd",
    2: "d66",
    3: "pvv",
    4: "cda",
    5: "sp",
    6: "pvda",
    7: "groenlinks",
    8: "fvd",
    9: "pvdd",
    10: "christenunie",
    11: "volt",
    12: "ja21",
    13: "sgp",
    14: "denk",
    15: "50plus",
    16: "bbb",
    17: "bij1",
    18: "other",
}

# 2023: V163 (vote in 2023) party codes
CODE_MAP_2023_CURR = {
    1: "vvd",
    2: "d66",
    3: "glpvda",  # PvdA/GroenLinks merged
    4: "pvv",
    5: "cda",
    6: "sp",
    7: "fvd",
    8: "pvdd",
    9: "christenunie",
    10: "volt",
    11: "ja21",
    12: "sgp",
    13: "denk",
    14: "50plus",
    15: "bbb",
    16: "bij1",
    17: "nsc",
    18: "other",  # BVNL and other small parties
}

# 2021: V071 (vote in 2017) party codes
CODE_MAP_2021_PREV = {
    1: "vvd",
    2: "pvv",
    3: "cda",
    4: "d66",
    5: "groenlinks",
    6: "sp",
    7: "pvda",
    8: "christenunie",
    9: "pvdd",
    10: "50plus",
    11: "sgp",
    12: "denk",
    13: "fvd",
    14: "other",
}

# 2021: V163 (vote in 2021) party codes
CODE_MAP_2021_CURR = {
    1: "vvd",
    2: "pvv",
    3: "cda",
    4: "d66",
    5: "groenlinks",
    6: "sp",
    7: "pvda",
    8: "christenunie",
    9: "pvdd",
    10: "50plus",
    11: "sgp",
    12: "denk",
    13: "fvd",
    14: "ja21",
    15: "volt",
    16: "bbb",
    17: "bij1",
    18: "other",  # Code Oranje, LP, etc.
}

# 2017: V071 (vote in 2012) party codes
CODE_MAP_2017_PREV = {
    1: "cda",
    2: "pvda",
    3: "vvd",
    4: "groenlinks",
    5: "sp",
    6: "d66",
    7: "christenunie",
    8: "sgp",
    9: "pvv",
    10: "pvdd",
    11: "50plus",
    12: "other",
}

# 2017: V163 (vote in 2017) party codes
CODE_MAP_2017_CURR = {
    1: "cda",
    2: "pvda",
    3: "vvd",
    4: "groenlinks",
    5: "sp",
    6: "d66",
    7: "christenunie",
    8: "sgp",
    9: "pvv",
    10: "pvdd",
    11: "50plus",
    12: "denk",
    13: "fvd",  # VNL (code 13) and FvD (code 14) — map both
    14: "fvd",
    15: "other",  # GeenPeil
    16: "other",  # Artikel 1
    17: "other",  # Nieuwe Wegen
    18: "other",  # Ondernemerspartij
    19: "other",  # Vrijzinnige Partij
    20: "other",  # Piratenpartij
    21: "other",
}

YEAR_CONFIG = {
    "2025": {
        "prev_map": CODE_MAP_2025,
        "curr_map": CODE_MAP_2025,
    },
    "2023": {
        "prev_map": CODE_MAP_2023_PREV,
        "curr_map": CODE_MAP_2023_CURR,
    },
    "2021": {
        "prev_map": CODE_MAP_2021_PREV,
        "curr_map": CODE_MAP_2021_CURR,
    },
    "2017": {
        "prev_map": CODE_MAP_2017_PREV,
        "curr_map": CODE_MAP_2017_CURR,
    },
}


# ── Download ──────────────────────────────────────────────────────────────

def download_file(file_id: int, output_path: str, api_token: str | None = None) -> str:
    """Download a data file from Dataverse."""
    import urllib.request

    url = f"{DATAVERSE_URL}/api/access/datafile/{file_id}?format=original"
    if api_token:
        url += f"&key={api_token}"

    print(f"  Downloading from {url} ...")
    try:
        urllib.request.urlretrieve(url, output_path)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print(f"  ERROR 403: This file is restricted. You need to register on")
            print(f"  {DATAVERSE_URL} and request access to the dataset, then pass")
            print(f"  the API token via --api-token or DATAVERSE_API_TOKEN env var.")
            sys.exit(1)
        raise
    print(f"  Saved to {output_path} ({os.path.getsize(output_path):,} bytes)")
    return output_path


# ── Extract transitions ──────────────────────────────────────────────────

def resolve_source_party(row, prev_map: dict) -> str | None:
    """Determine the source party (previous election vote)."""
    voted_prev = row["V070"]
    party_prev = row["V071"]

    if voted_prev == 2 or voted_prev == 3:
        return "not_voted"
    if voted_prev != 1:
        return None  # DK / won't say / INAP

    if party_prev in prev_map:
        return prev_map[party_prev]
    return None  # blank, invalid, DK, won't say


def resolve_target_party(row, curr_map: dict) -> str | None:
    """Determine the target party (current election vote)."""
    voted_curr = row["V160"]
    party_curr = row["V163"]

    if voted_curr == 2:
        return "not_voted"
    if voted_curr != 1:
        return None  # DK / won't say / INAP

    if party_curr in curr_map:
        return curr_map[party_curr]
    return None  # blank, invalid, DK, won't say


def compute_transitions(df: pd.DataFrame, prev_map: dict, curr_map: dict) -> dict[str, dict[str, int]]:
    """
    Compute the unweighted voter transition matrix.

    Returns: { target_party: { source_party: percentage, ... }, ... }
    Only entries >= 1% are kept. Percentages are rounded to whole numbers.
    """
    df = df.copy()
    df["source"] = df.apply(lambda r: resolve_source_party(r, prev_map), axis=1)
    df["target"] = df.apply(lambda r: resolve_target_party(r, curr_map), axis=1)

    df = df.dropna(subset=["source", "target"])

    transitions: dict[str, dict[str, int]] = {}

    for target in sorted(df["target"].unique()):
        target_voters = df[df["target"] == target]
        total = len(target_voters)
        if total == 0:
            continue

        from_counts: dict[str, int] = {}
        for source in sorted(df["source"].unique()):
            n = len(target_voters[target_voters["source"] == source])
            if n == 0:
                continue
            pct = round(n / total * 100)
            if pct >= 1:
                from_counts[source] = pct

        transitions[target] = from_counts

    return transitions


# ── Write YAML ────────────────────────────────────────────────────────────

def write_yaml_files(
    transitions: dict[str, dict[str, int]],
    output_dir: str,
    year: str,
    source_name: str,
    source_url: str,
) -> None:
    """Write per-party YAML files in the project's existing format."""
    movement_dir = Path(output_dir) / str(year) / "voters_movement"
    movement_dir.mkdir(parents=True, exist_ok=True)

    for party, from_parties in sorted(transitions.items()):
        sorted_from = dict(
            sorted(from_parties.items(), key=lambda x: x[1], reverse=True)
        )
        data = {
            "party": party,
            "vote_last_election_in_percentile": sorted_from,
        }
        filepath = movement_dir / f"{party}.yaml"
        with open(filepath, "w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
        print(f"  Wrote {filepath}")

    source_data = {
        "source": {
            "name": source_name,
            "url": source_url,
        }
    }
    source_path = movement_dir / "source.yaml"
    with open(source_path, "w") as f:
        yaml.dump(source_data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    print(f"  Wrote {source_path}")


# ── Main ───────────────────────────────────────────────────────────────────

def process_year(year: str, output_dir: str, cache_dir: str, api_token: str | None) -> None:
    """Process a single election year."""
    config = DATASETS[year]
    year_config = YEAR_CONFIG[year]

    print(f"\n{'='*60}")
    print(f"  Processing {year}")
    print(f"{'='*60}")

    # Download (or use cache)
    ext = ".dta" if year == "2025" else ".sav"
    cache_path = Path(cache_dir) / f"dpes{year}_data{ext}"
    if not cache_path.exists():
        download_file(config["file_id"], str(cache_path), api_token)
    else:
        print(f"  Using cached file: {cache_path}")

    # Read data file
    print("  Reading data file ...")
    if year == "2025":
        df, _ = pyreadstat.read_dta(str(cache_path), apply_value_formats=False)
    else:
        df, _ = pyreadstat.read_sav(str(cache_path), apply_value_formats=False)
    print(f"  {len(df)} respondents, {len(df.columns)} variables")

    # Compute transitions
    print("  Computing voter transitions ...")
    transitions = compute_transitions(df, year_config["prev_map"], year_config["curr_map"])

    print("\n  Transition matrix:")
    for target, sources in sorted(transitions.items()):
        print(f"    {target}: {sources}")

    # Write YAML files
    source_url = f"{DATAVERSE_URL}/dataset.xhtml?persistentId={config['pid']}"
    print(f"\n  Writing YAML files to {output_dir}/{year}/voters_movement/ ...")
    write_yaml_files(transitions, output_dir, year, config["source_name"], source_url)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch DPES voter movements from DANS SSH Data Stations"
    )
    parser.add_argument(
        "--year", type=str, default="2025",
        choices=["2025", "2023", "2021", "2017", "all"],
        help="Election year to process (default: 2025, or 'all' for every year)",
    )
    parser.add_argument(
        "--output-dir", type=str, default="resources/elections",
        help="Output directory root (default: resources/elections)",
    )
    parser.add_argument(
        "--cache-dir", type=str, default="/tmp",
        help="Directory to cache downloaded data files (default: /tmp)",
    )
    parser.add_argument(
        "--api-token", type=str, default=None,
        help="Dataverse API token for restricted files (or set DATAVERSE_API_TOKEN env var)",
    )
    args = parser.parse_args()

    api_token = args.api_token or os.environ.get("DATAVERSE_API_TOKEN", None)

    project_root = Path(__file__).resolve().parent.parent
    output_dir = project_root / args.output_dir

    years = ["2025", "2023", "2021", "2017"] if args.year == "all" else [args.year]

    for year in years:
        process_year(year, str(output_dir), args.cache_dir, api_token)

    print("\nDone!")


if __name__ == "__main__":
    main()
