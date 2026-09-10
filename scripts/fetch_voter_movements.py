#!/usr/bin/env python3
"""
Fetch public DPES/NKO 2025 voter movement data from the DANS SSH Data Stations
Dataverse repository and write YAML files matching the project's existing format.

Dataset: https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/SS/ZBNO8O

Downloads the VEDPES Stata file (publicly accessible), extracts the
2023→2025 voter transition matrix including "not_voted" and "other"
categories, and writes per-party YAML files.

Usage:
    python3 scripts/fetch_voter_movements.py [--year 2025] [--output-dir resources/elections]

Requires: pandas, pyreadstat, pyyaml, requests
"""

import argparse
import io
import os
import sys
from pathlib import Path

import pandas as pd
import pyreadstat
import yaml


# ── Dataverse configuration ──────────────────────────────────────────────

DATAVERSE_URL = "https://ssh.datastations.nl"
DATASET_PID = "doi:10.17026/SS/ZBNO8O"

# File IDs in the Dataverse dataset (discovered via the API)
# The main dataset (621942) is restricted; VEDPES (621941) is public.
VEDPES_FILE_ID = 621941


# ── Party code mapping ────────────────────────────────────────────────────
# Maps numeric codes in the Stata file to the party IDs used in this project.

PARTY_MAP = {
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
}

# Special codes
CODE_NOT_VOTED_2023 = None  # V070 != 1 means didn't vote in 2023
CODE_OTHER = 19
CODE_BLANK = 30
CODE_INVALID = 31
CODE_DK = 994
CODE_WONT_SAY = 995

# Parties that get YAML files written
ALL_PARTIES = list(PARTY_MAP.values()) + ["not_voted", "other"]


# ── Download ──────────────────────────────────────────────────────────────

def download_vedpes(output_path: str) -> str:
    """Download the VEDPES Stata file from Dataverse."""
    import urllib.request

    url = f"{DATAVERSE_URL}/api/access/datafile/{VEDPES_FILE_ID}?format=original"
    print(f"Downloading VEDPES dataset from {url} ...")
    urllib.request.urlretrieve(url, output_path)
    print(f"  Saved to {output_path} ({os.path.getsize(output_path):,} bytes)")
    return output_path


# ── Extract transitions ──────────────────────────────────────────────────

def resolve_source_party(row) -> str | None:
    """Determine the source party (2023 vote) for a respondent."""
    voted_2023 = row["V070"]
    party_2023 = row["V071"]

    if voted_2023 == 2 or voted_2023 == 3:
        return "not_voted"
    if voted_2023 != 1:
        return None  # DK / won't say

    if party_2023 in PARTY_MAP:
        return PARTY_MAP[party_2023]
    if party_2023 == CODE_OTHER:
        return "other"
    # blank, invalid, DK, won't say → skip
    return None


def resolve_target_party(row) -> str | None:
    """Determine the target party (2025 vote) for a respondent."""
    voted_2025 = row["V160"]
    party_2025 = row["V163"]

    if voted_2025 == 2:
        return "not_voted"
    if voted_2025 != 1:
        return None  # DK / won't say

    if party_2025 in PARTY_MAP:
        return PARTY_MAP[party_2025]
    if party_2025 == CODE_OTHER:
        return "other"
    # blank, invalid, DK, won't say → skip
    return None


def compute_transitions(df: pd.DataFrame) -> dict[str, dict[str, int]]:
    """
    Compute the unweighted voter transition matrix.

    Returns a dict: { target_party: { source_party: percentage, ... }, ... }
    Percentages are rounded to whole numbers and only entries >= 1% are kept.
    """
    df = df.copy()
    df["source"] = df.apply(resolve_source_party, axis=1)
    df["target"] = df.apply(resolve_target_party, axis=1)

    # Drop rows where either source or target is unknown
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
) -> None:
    """Write per-party YAML files in the project's existing format."""
    movement_dir = Path(output_dir) / str(year) / "voters_movement"
    movement_dir.mkdir(parents=True, exist_ok=True)

    for party, from_parties in sorted(transitions.items()):
        # Sort by percentage descending for readability
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

    # Write source.yaml
    source_data = {
        "source": {
            "name": "Dutch Parliamentary Election Study 2025 (DPES/NKO 2025)",
            "url": "https://ssh.datastations.nl/dataset.xhtml?persistentId=doi:10.17026/SS/ZBNO8O",
        }
    }
    source_path = movement_dir / "source.yaml"
    with open(source_path, "w") as f:
        yaml.dump(source_data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    print(f"  Wrote {source_path}")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch DPES 2025 voter movements from DANS SSH Data Stations"
    )
    parser.add_argument(
        "--year", type=str, default="2025",
        help="Election year directory (default: 2025)",
    )
    parser.add_argument(
        "--output-dir", type=str, default="resources/elections",
        help="Output directory root (default: resources/elections)",
    )
    parser.add_argument(
        "--cache-dir", type=str, default="/tmp",
        help="Directory to cache the downloaded Stata file (default: /tmp)",
    )
    args = parser.parse_args()

    # Determine project root (parent of scripts/)
    project_root = Path(__file__).resolve().parent.parent
    output_dir = project_root / args.output_dir

    # Download (or use cache)
    cache_path = Path(args.cache_dir) / "dpes2025_vedpes.dta"
    if not cache_path.exists():
        download_vedpes(str(cache_path))
    else:
        print(f"Using cached file: {cache_path}")

    # Read Stata file
    print("Reading Stata file ...")
    df, _ = pyreadstat.read_dta(str(cache_path), apply_value_formats=False)
    print(f"  {len(df)} respondents, {len(df.columns)} variables")

    # Compute transitions
    print("Computing voter transitions ...")
    transitions = compute_transitions(df)

    print("\nTransition matrix (2023 → 2025):")
    for target, sources in sorted(transitions.items()):
        print(f"  {target}: {sources}")

    # Write YAML files
    print(f"\nWriting YAML files to {output_dir}/{args.year}/voters_movement/ ...")
    write_yaml_files(transitions, str(output_dir), args.year)

    print("\nDone!")


if __name__ == "__main__":
    main()
