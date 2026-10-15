"""Estimate a five-second step budget using the local simulation engine."""

from functools import lru_cache
from statistics import median
from time import perf_counter

from tm_builder.definition import parse_definition
from tm_builder.simulation import MAX_STEPS, simulate
from tm_builder.workspace import EXAMPLES


def budget_for_sample(steps, seconds, target_seconds=5):
    estimated = round(steps / max(seconds, 0.000001) * target_seconds / 10000) * 10000
    return min(MAX_STEPS, max(10000, estimated))


@lru_cache(maxsize=1)
def execution_limits():
    # A bounded binary counter exercises reads, writes, moves, and trace recording.
    definition, _ = parse_definition((EXAMPLES / 'machines/binary_counter.yaml').read_text())
    samples = []
    sample_steps = 50000
    for _ in range(3):
        start = perf_counter()
        simulate(definition, ['0' * 24], sample_steps, compact=True)
        samples.append(perf_counter() - start)
    seconds = median(samples)
    return {'default_max_steps': budget_for_sample(sample_steps, seconds),
            'maximum': MAX_STEPS, 'target_seconds': 5,
            'sample_steps': sample_steps, 'sample_seconds': seconds}
