# Conservation of exports containing published Iris observations

Source: Fisher, R. A., *Iris*, UC Irvine Machine Learning Repository,
DOI [10.24432/C56C76](https://doi.org/10.24432/C56C76), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original downloaded
CSV and its SHA-256 are preserved here. The publisher's landing page states this
license; no data were collected from people for this experiment.

Changes: add a stable ordinal ID within this frozen snapshot, keep published cell
strings, choose the first 100 records for the previous export, and use all 150 in
reverse order for the new export. This demonstrates additions and row-order
independence on actual published observations. Ordinal IDs are not a reliable
identity scheme across future publisher reorderings.

The strict preservation policy should accept 50 additions with all 100 previous
selected records unchanged. Two deliberately artificial controls alter one value
or remove one previous record; both must be flagged by the actual native checker.
Run `python scripts/run_public_export_experiment.py /path/to/bundle` to reproduce.

The original CSV decoder and conservation theorem concern these export bytes.
This is not a model-accuracy experiment, new measurement collection or validation
of the underlying biology. UCI itself notes discrepancies from Fisher's original
article at observations 35 and 38. They are preserved rather than silently fixed:
a formally preserved dataset can still contain scientific errors.
