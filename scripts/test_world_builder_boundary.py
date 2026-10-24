import unittest
from pathlib import Path
from world_builder_boundary import review_world_builder

SOURCE = (Path(__file__).resolve().parents[1] / "public/world-builder.mjs").read_text()


class WorldBuilderBoundary(unittest.TestCase):
    def test_actual_source_has_the_single_reviewed_opt_in_route(self):
        self.assertEqual(review_world_builder(SOURCE), [])

    def test_external_or_other_same_origin_targets_are_rejected(self):
        for target in ["https://example.invalid/upload", "/api/arena/other", "//example.invalid"]:
            self.assertTrue(review_world_builder(SOURCE.replace("/api/arena/countermodel/donate", target)))

    def test_consent_snapshot_and_timeout_removal_are_rejected(self):
        for token in ["playbackImported||", "!$('wbAdult').checked||", "!$('wbConsent').checked", "redirect:'error',",
                      "signal:AbortSignal.timeout(15000),", "session:snapshot"]:
            self.assertTrue(review_world_builder(SOURCE.replace(token, "")))

    def test_additional_network_calls_are_rejected(self):
        for call in ["fetch('/extra')", "new XMLHttpRequest()", "new WebSocket('wss://example.invalid')", "navigator.sendBeacon('/extra')"]:
            self.assertTrue(review_world_builder(SOURCE + "\n" + call))

    def test_automatic_persistence_is_rejected(self):
        for call in ["localStorage.setItem('moves',data)", "sessionStorage.setItem('moves',data)", "indexedDB.open('moves')"]:
            self.assertTrue(review_world_builder(SOURCE + "\n" + call))


if __name__ == "__main__":
    unittest.main()
