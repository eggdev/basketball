"""Extract the 2024-25 Rotoworld PDF with Poppler's positioned words."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

SOURCE_URL = "https://nbcsports.brightspotcdn.com/03/10/b09f526442aab7ad4db7ba3584ed/rotoworld-2024-25-fantasy-basketball-kit.pdf"
NS = {"x": "http://www.w3.org/1999/xhtml"}
TEAMS = dict(
    zip(
        "Atlanta Hawks|Boston Celtics|Brooklyn Nets|Charlotte Hornets|Chicago Bulls|Cleveland Cavaliers|Dallas Mavericks|Denver Nuggets|Detroit Pistons|Golden State Warriors|Houston Rockets|Indiana Pacers|Los Angeles Clippers|Los Angeles Lakers|Memphis Grizzlies|Miami Heat|Milwaukee Bucks|Minnesota Timberwolves|New Orleans Pelicans|New York Knicks|Oklahoma City Thunder|Orlando Magic|Philadelphia 76ers|Phoenix Suns|Portland Trail Blazers|Sacramento Kings|San Antonio Spurs|Toronto Raptors|Utah Jazz|Washington Wizards".split(
            "|"
        ),
        "ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split(),
    )
)
POSITIONS = {
    "POINT GUARDS": "PG",
    "SHOOTING GUARDS": "SG",
    "SMALL FORWARD": "SF",
    "SMALL FORWARDS": "SF",
    "POWER FORWARD": "PF",
    "POWER FORWARDS": "PF",
    "CENTERS": "C",
}
FIELDS = "games minutes points fieldGoalsMade fieldGoalsAttempted fieldGoalPercentage freeThrowsMade freeThrowsAttempted freeThrowPercentage threePointersMade rebounds assists steals blocks turnovers yahooPoints".split()


def positioned_lines(root: ElementTree.Element):
    """Read each column top to bottom, including profiles across page breaks."""
    for page_number, page in enumerate(root.findall(".//x:page", NS), 1):
        midpoint = float(page.attrib["width"]) / 2
        for column in (0, 1):
            words = [
                word
                for word in page.findall(".//x:word", NS)
                if (float(word.attrib["xMin"]) >= midpoint) == bool(column)
            ]
            groups: list[tuple[float, list[ElementTree.Element]]] = []
            for word in sorted(
                words,
                key=lambda item: (
                    float(item.attrib["yMin"]),
                    float(item.attrib["xMin"]),
                ),
            ):
                y = float(word.attrib["yMin"])
                group = next(
                    (group for group in reversed(groups[-4:]) if abs(group[0] - y) < 2),
                    None,
                )
                if group is None:
                    group = (y, [])
                    groups.append(group)
                group[1].append(word)
            for _, row in sorted(groups, key=lambda group: group[0]):
                text = " ".join(
                    word.text or ""
                    for word in sorted(row, key=lambda word: float(word.attrib["xMin"]))
                )
                yield page_number, column + 1, text


def parse_rows(lines):
    rows = []
    previous = ""
    profile = None
    position = None
    seen = set()
    for page, column, line in lines:
        line = " ".join(line.split())
        if line in POSITIONS:
            position = POSITIONS[line]
        if line in TEAMS:
            if profile is not None:
                raise ValueError(f"Missing projection for {profile['sourceName']}")
            if not previous or not position or not re.search(r"[A-Za-z]", previous):
                raise ValueError(f"Missing player heading on PDF page {page}")
            profile = {
                "sourceName": previous,
                "headerTeam": TEAMS[line],
                "position": position,
                "headerPage": page,
            }
        if re.match(r"^PROJ\s", line):
            if profile is None:
                raise ValueError(
                    f"Projection without player heading on PDF page {page}"
                )
            fields = line.split()
            if len(fields) != 18 or fields[1] not in TEAMS.values():
                raise ValueError(
                    f"Invalid projection columns on PDF page {page}: {line}"
                )
            values = dict(
                zip(FIELDS, (float(value.rstrip("%")) for value in fields[2:]))
            )
            if any(not math.isfinite(value) or value < 0 for value in values.values()):
                raise ValueError(f"Invalid number for {profile['sourceName']}")
            if not 0 < values["games"] <= 82 or values["games"] != int(values["games"]):
                raise ValueError(f"Invalid projected games for {profile['sourceName']}")
            issues = []
            for made, attempted in (
                ("fieldGoalsMade", "fieldGoalsAttempted"),
                ("freeThrowsMade", "freeThrowsAttempted"),
                ("threePointersMade", "fieldGoalsMade"),
            ):
                if values[made] > values[attempted]:
                    issues.append(f"{made} exceeds {attempted}")
            if (
                abs(
                    values["points"]
                    - (
                        2 * values["fieldGoalsMade"]
                        + values["threePointersMade"]
                        + values["freeThrowsMade"]
                    )
                )
                > 0.35
            ):
                issues.append(
                    "Points disagree with shooting components beyond rounding tolerance"
                )
            if (
                values["fieldGoalPercentage"] > 100
                or values["freeThrowPercentage"] > 100
            ):
                issues.append("Shooting percentage exceeds 100")
            if fields[1] != profile["headerTeam"]:
                issues.append("Projection team differs from player heading")
            if profile["sourceName"] in seen:
                raise ValueError(f"Duplicate player: {profile['sourceName']}")
            seen.add(profile["sourceName"])
            rows.append(
                {
                    **profile,
                    "page": page,
                    "column": column,
                    "team": fields[1],
                    "values": values,
                    "rawRow": line,
                    "issues": issues,
                }
            )
            profile = None
        previous = line
    if profile is not None:
        raise ValueError(f"Missing projection for {profile['sourceName']}")
    if not rows:
        raise ValueError("No player projections found")
    return rows


def extract(path: Path):
    result = subprocess.run(
        ["pdftotext", "-bbox", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    root = ElementTree.fromstring(result.stdout)
    metadata = {
        element.attrib["name"]: element.attrib.get("content", "")
        for element in root.findall(".//x:meta", NS)
    }
    rows = parse_rows(positioned_lines(root))
    pages = root.findall(".//x:page", NS)
    if not pages or "2024-25" not in [
        word.text for word in pages[0].findall(".//x:word", NS)
    ]:
        raise ValueError("Expected the 2024-25 draft kit")
    if len(rows) != sum(word.text == "PROJ" for word in root.findall(".//x:word", NS)):
        raise ValueError("Some PDF projection rows were not extracted")
    return {
        "source": "rotoworld",
        "seasonKey": "2024-25",
        "extractorVersion": "rotoworld-pdf-v1",
        "sourceUrl": SOURCE_URL,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "pdfMetadata": metadata,
        "publicationVerified": False,
        "pageCount": len(root.findall(".//x:page", NS)),
        "rows": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    snapshot = extract(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(
        json.dumps(
            {
                "players": len(snapshot["rows"]),
                "flagged": sum(bool(row["issues"]) for row in snapshot["rows"]),
                "output": str(args.output),
            }
        )
    )


if __name__ == "__main__":
    main()
