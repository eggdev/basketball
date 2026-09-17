from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fantasy_basketball.auction_csv import parse_auction_matrix


class AuctionCsvTests(unittest.TestCase):
    def test_parses_legacy_matrix(self) -> None:
        content = """1,0,,0,\n,1,,2,\n,Alice,$0,Bob,$0\n1,Curry,54,Jokic,63\n2,x,0,Doncic,52\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "auction.csv"
            path.write_text(content, encoding="utf-8")
            rosters, issues = parse_auction_matrix(path, "test", 2)

        self.assertEqual([], issues)
        self.assertEqual(["Alice", "Bob"], [roster.manager for roster in rosters])
        self.assertEqual("Curry", rosters[0].entries[0].source_name)
        self.assertTrue(rosters[0].entries[1].placeholder)
        self.assertEqual("0", str(rosters[0].entries[1].price))

    def test_parses_offset_matrix(self) -> None:
        content = """Current Pick,#DIV/0!,2,,2,\n,,Alice,$0,Bob,$0\n,1,Curry,54,Jokic,63\n,2,Durant,40,Doncic,52\n"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "auction.csv"
            path.write_text(content, encoding="utf-8")
            rosters, issues = parse_auction_matrix(path, "test", 2)

        self.assertEqual([], issues)
        self.assertEqual(2, len(rosters))
        self.assertEqual("Durant", rosters[0].entries[1].source_name)


if __name__ == "__main__":
    unittest.main()
