from __future__ import annotations

import unittest

from fantasy_basketball.models import Player
from fantasy_basketball.names import (
    AliasTarget,
    best_name_match,
    fantrax_display_name,
    normalize_name,
)


class NameTests(unittest.TestCase):
    def test_converts_fantrax_name_order(self) -> None:
        self.assertEqual("Michael Porter Jr.", fantrax_display_name("Porter Jr., Michael"))

    def test_matches_unique_surname(self) -> None:
        players = [
            Player("1", "Stephen Curry"),
            Player("2", "Nikola Jokic"),
        ]
        match = best_name_match("2021-22", "Curry", players, {}, 0.8, 0.05)
        self.assertIsNotNone(match)
        self.assertEqual("1", match.player.fantrax_id)

    def test_uses_explicit_alias(self) -> None:
        players = [
            Player("1", "Fred VanVleet"),
            Player("2", "Franz Wagner"),
        ]
        aliases = {
            ("2021-22", "fvv"): AliasTarget("2021-22", "FVV", "Fred VanVleet")
        }
        match = best_name_match("2021-22", "FVV", players, aliases, 0.8, 0.05)
        self.assertIsNotNone(match)
        self.assertEqual("alias", match.method)

    def test_ignores_apostrophe_and_initial_punctuation(self) -> None:
        self.assertEqual(normalize_name("De'Aaron Fox"), normalize_name("DeAaron Fox"))
        self.assertEqual(normalize_name("T.J. McConnell"), normalize_name("TJ McConnell"))


if __name__ == "__main__":
    unittest.main()
