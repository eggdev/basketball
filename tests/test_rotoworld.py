import unittest
from xml.etree import ElementTree

from fantasy_basketball.rotoworld import parse_rows, positioned_lines


class RotoworldTests(unittest.TestCase):
    def test_column_order_keeps_player_with_projection(self):
        # PDF content order can put the right column before the left column.
        xml = """<html xmlns="http://www.w3.org/1999/xhtml"><page width="612">
          <word xMin="320" yMin="10">right</word>
          <word xMin="10" yMin="10">left</word>
          <word xMin="10" yMin="50">continued</word>
          <word xMin="40" yMin="10.2">name</word>
        </page></html>"""
        self.assertEqual(
            list(positioned_lines(ElementTree.fromstring(xml))),
            [(1, 1, "left name"), (1, 1, "continued"), (1, 2, "right")],
        )

    def test_profile_across_page_break_and_raw_values(self):
        rows = parse_rows(
            [
                (6, 2, "POINT GUARDS"),
                (6, 2, "Cade Cunningham"),
                (6, 2, "Detroit Pistons"),
                (7, 1, "POINT GUARDS"),
                (
                    7,
                    1,
                    "PROJ DET 65 35.2 24.6 8.9 19.8 45 4.6 5.3 87% 2.3 5.1 8.9 1.1 0.4 3.6 40",
                ),
            ]
        )
        self.assertEqual(rows[0]["sourceName"], "Cade Cunningham")
        self.assertEqual(rows[0]["headerPage"], 6)
        self.assertEqual(rows[0]["page"], 7)
        self.assertEqual(rows[0]["values"]["games"], 65)
        self.assertEqual(rows[0]["values"]["freeThrowPercentage"], 87)
        self.assertEqual(rows[0]["issues"], [])

    def test_source_errors_are_preserved_and_flagged(self):
        rows = parse_rows(
            [
                (40, 1, "SMALL FORWARD"),
                (40, 1, "Vince Williams"),
                (40, 1, "Memphis Grizzlies"),
                (
                    40,
                    1,
                    "PROJ MEM 55 17.5 2.8 0.7 1.6 45 0.4 0.5 80% 1 4 1.4 0.7 0.5 0.4 25",
                ),
            ]
        )
        self.assertEqual(rows[0]["values"]["fieldGoalsMade"], 0.7)
        self.assertIn("threePointersMade exceeds fieldGoalsMade", rows[0]["issues"])

    def test_missing_heading_or_projection_fails(self):
        with self.assertRaisesRegex(ValueError, "without player"):
            parse_rows(
                [
                    (
                        5,
                        1,
                        "PROJ DAL 68 36.8 33.9 11.4 23.2 49 7.1 9 79% 4.2 9.6 10.2 1.5 0.6 4 61",
                    )
                ]
            )
        with self.assertRaisesRegex(ValueError, "Missing projection"):
            parse_rows(
                [
                    (5, 1, "POINT GUARDS"),
                    (5, 1, "Luka Doncic"),
                    (5, 1, "Dallas Mavericks"),
                ]
            )
